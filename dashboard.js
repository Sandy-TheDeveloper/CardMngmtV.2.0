// dashboard.js - Phase 2 Upgraded Dashboard, Vault & Interconnected Bill Payments

let cards = JSON.parse(localStorage.getItem('maxi_cards_v4')) || [];
let paidCycles = JSON.parse(localStorage.getItem('maxi_paid_v4')) || {};

let realToday = new Date();
let simDateStr = localStorage.getItem('maxi_sim_date');
let simulatedDate = simDateStr ? new Date(simDateStr) : new Date(realToday);

let calViewDate = new Date(simulatedDate);
let isMonthMode = false;
let pendingPayCycle = null;
let pendingPayCardId = null;
let editingCardId = null;
let confirmCallback = null;

document.getElementById('simDateInput').value = simulatedDate.toISOString().split('T')[0];

// Normalize legacy paidCycles (if string, convert to object)
function getPaidRecord(cycleKey) {
    let val = paidCycles[cycleKey];
    if (!val) return null;
    if (typeof val === 'string') return { date: val, amount: 0, txId: null };
    return val;
}

function updateSimDate() {
    const d = document.getElementById('simDateInput').value;
    if(d) {
        simulatedDate = new Date(d);
        localStorage.setItem('maxi_sim_date', simulatedDate.toISOString());
        calViewDate = new Date(simulatedDate);
        toggleDrawer(false);
        updateDashboard();
    }
}

function resetSimDate() {
    simulatedDate = new Date(realToday);
    localStorage.removeItem('maxi_sim_date');
    document.getElementById('simDateInput').value = simulatedDate.toISOString().split('T')[0];
    calViewDate = new Date(simulatedDate);
    toggleDrawer(false);
    updateDashboard();
}

// ---- UPGRADED BACKUP LOGIC (Includes Transactions) ----
function exportBackup() {
    const data = { cards, paidCycles, transactions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MaxiCard_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toggleDrawer(false);
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.cards && data.paidCycles) {
                cards = data.cards;
                paidCycles = data.paidCycles;
                transactions = data.transactions || [];
                localStorage.setItem('maxi_cards_v4', JSON.stringify(cards));
                localStorage.setItem('maxi_paid_v4', JSON.stringify(paidCycles));
                localStorage.setItem('maxi_tx_v1', JSON.stringify(transactions));
                showConfirm("Restored", "Backup restored successfully!", null);
                toggleDrawer(false);
                updateDashboard();
            } else {
                showConfirm("Error", "Invalid backup file structure.", null);
            }
        } catch (err) { showConfirm("Error", "Error reading backup file.", null); }
    };
    reader.readAsText(file);
}

// ---- CYCLE MATH ----
function getCyclesForCard(card, year, month) {
    let cycles = [];
    let startD = new Date(card.firstDate);
    let targetDay = startD.getDate();

    for(let offset = -2; offset <= 0; offset++) {
        let m = month + offset; let y = year;
        if(m < 0) { m += 12; y -= 1; }

        let stmtDate = new Date(y, m, targetDay);
        if(stmtDate.getMonth() !== m) stmtDate = new Date(y, m + 1, 0);

        if (stmtDate < startD) continue;
        if (card.isClosed && card.closeDate && stmtDate > new Date(card.closeDate)) continue;

        let dueDate = new Date(stmtDate);
        dueDate.setDate(dueDate.getDate() + card.graceDays);
        let key = `${card.id}_${y}-${(m+1).toString().padStart(2,'0')}`;
        let paidRec = getPaidRecord(key);
        cycles.push({ stmtDate, dueDate, key, paidDate: paidRec ? paidRec.date : null, paidAmount: paidRec ? paidRec.amount : 0 });
    }
    return cycles;
}

function getLatestCycle(card) {
    let startD = new Date(card.firstDate);
    let targetDay = startD.getDate();
    let y = simulatedDate.getFullYear();
    let m = simulatedDate.getMonth();

    let stmtDate = new Date(y, m, targetDay);
    if(stmtDate.getMonth() !== m) stmtDate = new Date(y, m + 1, 0);

    if (stmtDate > simulatedDate) {
        m -= 1; if(m < 0) { m = 11; y -= 1; }
        stmtDate = new Date(y, m, targetDay);
        if(stmtDate.getMonth() !== m) stmtDate = new Date(y, m + 1, 0);
    }

    if (card.isClosed && card.closeDate && stmtDate > new Date(card.closeDate)) {
        let cd = new Date(card.closeDate);
        stmtDate = new Date(cd.getFullYear(), cd.getMonth(), targetDay);
        if(stmtDate.getMonth() !== cd.getMonth()) stmtDate = new Date(cd.getFullYear(), cd.getMonth() + 1, 0);
        if(stmtDate > cd) {
            let pm = cd.getMonth() - 1; let py = cd.getFullYear();
            if(pm < 0) { pm = 11; py -= 1; }
            stmtDate = new Date(py, pm, targetDay);
        }
    }

    if (stmtDate < startD) return null;

    let dueDate = new Date(stmtDate);
    dueDate.setDate(dueDate.getDate() + card.graceDays);
    let key = `${card.id}_${stmtDate.getFullYear()}-${(stmtDate.getMonth()+1).toString().padStart(2,'0')}`;
    let paidRec = getPaidRecord(key);
    return { stmtDate, dueDate, key, paidDate: paidRec ? paidRec.date : null, paidAmount: paidRec ? paidRec.amount : 0 };
}

function updateDashboard() {
    renderCalendar();
    renderCarousel();
    renderVault();
    updateStatusStrip();
    if (typeof renderLedger === 'function') renderLedger();
}

function navCalendar(dir) {
    if(isMonthMode) calViewDate.setMonth(calViewDate.getMonth() + dir);
    else calViewDate.setDate(calViewDate.getDate() + (dir * 7));
    document.getElementById('date-details-panel').classList.add('hidden');
    renderCalendar();
}

function toggleCalendarMode() {
    isMonthMode = !isMonthMode;
    document.getElementById('cal-expand-btn').innerText = isMonthMode ? "Collapse" : "Expand";
    document.getElementById('date-details-panel').classList.add('hidden');
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    document.getElementById('calendar-month-label').innerText = calViewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    let start, end;
    if (isMonthMode) {
        start = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), 1);
        end = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 0);
        let startDay = start.getDay();
        const days = ['S','M','T','W','T','F','S'];
        days.forEach(d => grid.innerHTML += `<div class="cal-day-name">${d}</div>`);
        for (let i = 0; i < startDay; i++) grid.innerHTML += `<div class="cal-cell muted"></div>`;
    } else {
        start = new Date(calViewDate);
        end = new Date(calViewDate); end.setDate(end.getDate() + 6);
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        for(let i=0; i<7; i++){
            let d = new Date(start); d.setDate(d.getDate() + i);
            grid.innerHTML += `<div class="cal-day-name">${days[d.getDay()]}</div>`;
        }
    }

    let current = new Date(start);
    while (current <= end) {
        let isToday = current.toDateString() === simulatedDate.toDateString();
        let loopDate = new Date(current); 
        
        let dues = [];
        cards.forEach(c => {
            let cycles = getCyclesForCard(c, loopDate.getFullYear(), loopDate.getMonth());
            cycles.forEach(cy => {
                if(cy.dueDate.toDateString() === loopDate.toDateString()) {
                    dues.push({cardId: c.id, name: c.name, ...cy});
                }
            });
        });
        
        let unpaid = dues.filter(d => !d.paidDate);
        let cellClass = isToday ? 'today' : (unpaid.length > 0 ? 'due-unpaid' : '');
        let dots = dues.map(d => `<div class="dot ${d.paidDate ? 'paid' : 'unpaid'}"></div>`).join('');
        
        let cell = document.createElement('div');
        cell.className = `cal-cell ${cellClass}`;
        cell.innerHTML = `${loopDate.getDate()}<div class="dot-container">${dots}</div>`;
        cell.onclick = () => showDateDetails(loopDate, dues);
        
        grid.appendChild(cell);
        current.setDate(current.getDate() + 1);
    }
}

function showDateDetails(dateObj, dues) {
    const panel = document.getElementById('date-details-panel');
    if (dues.length === 0) {
        panel.innerHTML = `<i style="color:var(--text-muted);">No bills due on ${dateObj.toLocaleDateString('en-US', {month:'short', day:'numeric'})}.</i>`;
    } else {
        let html = `<strong style="display:block; margin-bottom:10px;">Due on ${dateObj.toLocaleDateString('en-US', {month:'short', day:'numeric'})}:</strong>`;
        dues.forEach(d => {
            let amtStr = d.paidAmount > 0 ? ` (₹${Number(d.paidAmount).toLocaleString()})` : '';
            let stat = d.paidDate
                ? `<span style="color:var(--success); font-weight:600;">Paid on ${new Date(d.paidDate).toLocaleDateString('en-GB')}${amtStr}</span>`
                : `<span style="color:var(--danger); font-weight:600;">Unpaid</span>`;
            let btn = d.paidDate
                ? `<button class="btn-action" onclick="togglePayment('${d.key}', '${d.name}', ${d.cardId}, true, event)">Undo</button>`
                : `<button class="btn-primary btn-sm" onclick="togglePayment('${d.key}', '${d.name}', ${d.cardId}, false, event)">Mark Paid</button>`;
            html += `<div class="date-detail-item">
                <div><strong>${d.name}</strong><br><small>${stat}</small></div>
                <div>${btn}</div>
            </div>`;
        });
        panel.innerHTML = html;
    }
    panel.classList.remove('hidden');
}

function flipCard(el, e) {
    if (e.target.tagName === 'BUTTON') return;
    el.classList.toggle('flipped');
}

function renderCarousel() {
    const carousel = document.getElementById('card-carousel');
    let activeCards = cards.filter(c => !c.isClosed);
    
    if (activeCards.length === 0) {
        carousel.innerHTML = '<div class="solid-panel" style="width:100%; text-align:center; color:var(--text-muted);">No active cards. Go to Vault to add your first card.</div>';
        return;
    }
    
    carousel.innerHTML = '';
    activeCards.forEach(card => {
        let cycle = getLatestCycle(card);
        if (!cycle) return; 

        let metrics = getCardLimitMetrics(card);
        let rewards = getCardTotalRewards(card.id);
        let isPaid = !!cycle.paidDate;
        let btnText = isPaid ? `✓ Paid on ${new Date(cycle.paidDate).toLocaleDateString('en-GB')}` : 'MARK AS PAID';
        let bgClass = card.pattern && card.pattern !== 'none' ? `pattern-${card.pattern}` : '';

        carousel.innerHTML += `
            <div class="cc-wrapper" onclick="flipCard(this, event)">
                <div class="cc-inner">
                    <div class="cc-front" style="background-color: ${card.color};">
                        <div class="cc-top">
                            ${card.autopay ? '<div class="autopay-badge">AUTOPAY ON</div>' : ''}
                            <div class="cc-name">${card.name}</div>
                            <button class="edit-icon" onclick="openAddEditModal(${card.id}); event.stopPropagation();">✎</button>
                        </div>
                        <div class="cc-details">
                            <div>Stmt Date <span>${cycle.stmtDate.toLocaleDateString('en-GB', {day:'numeric', month:'short'})}</span></div>
                            <div>Due Date <span>${cycle.dueDate.toLocaleDateString('en-GB', {day:'numeric', month:'short'})}</span></div>
                        </div>
                        <button class="btn-mark" style="background:${isPaid ? 'rgba(0,0,0,0.35)' : 'var(--success)'}" onclick="togglePayment('${cycle.key}', '${card.name}', ${card.id}, ${isPaid}, event)">
                            ${btnText}
                        </button>
                    </div>
                    <div class="cc-back ${bgClass}" style="background-color: ${card.color};">
                        <div style="width:100%;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong style="font-size:1.05rem;">${card.name}</strong>
                                <span style="font-size:0.75rem; background:rgba(0,0,0,0.3); padding:3px 8px; border-radius:6px;">🏆 ₹${rewards.toLocaleString()}</span>
                            </div>
                            <div style="margin-top:12px; font-size:0.8rem;">
                                Available: <strong>₹${metrics.available.toLocaleString()}</strong> / ₹${metrics.limit.toLocaleString()}
                                <div class="limit-bar-bg">
                                    <div class="limit-bar-fill" style="width:${metrics.utilPercent}%;"></div>
                                </div>
                            </div>
                            <div style="margin-top:8px; font-size:0.75rem; opacity:0.9;">
                                Card Used: ₹${metrics.ownUsed.toLocaleString()} ${metrics.isShared ? `(Pool Used: ₹${metrics.poolUsed.toLocaleString()})` : ''}
                            </div>
                        </div>
                        <button class="btn-mark" style="background:rgba(255,255,255,0.22);" onclick="openTxModal(null, ${card.id}); event.stopPropagation();">
                            + Log Spend on this Card
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

function updateStatusStrip() {
    let unpaidCount = 0;
    cards.filter(c => !c.isClosed).forEach(c => {
        let cyc = getLatestCycle(c);
        if(cyc && !cyc.paidDate && cyc.dueDate >= simulatedDate && (cyc.dueDate - simulatedDate)/(1000*60*60*24) <= 7) unpaidCount++;
    });
    
    const strip = document.getElementById('status-strip');
    if (unpaidCount > 0) {
        strip.innerText = `Alert: ${unpaidCount} payment(s) due within 7 days.`;
        strip.style.background = 'var(--danger)';
    } else {
        strip.innerText = 'All caught up. No immediate dues.';
        strip.style.background = 'var(--primary)';
    }
}

function renderVault() {
    const filter = document.getElementById('vault-filter').value;
    const grid = document.getElementById('vault-grid');
    
    // Global Limit & Utilization Math (Deduplicating Shared Groups)
    let uniqueLimits = {};
    let totalUsed = 0;

    cards.filter(c => !c.isClosed).forEach(card => {
        if (card.sharedGroup && card.sharedGroup.trim() !== '') {
            uniqueLimits[card.sharedGroup.trim().toLowerCase()] = parseFloat(card.limit);
        } else {
            uniqueLimits['card_' + card.id] = parseFloat(card.limit);
        }
        totalUsed += getCardUsedBalance(card.id);
    });

    let totalLim = Object.values(uniqueLimits).reduce((a, b) => a + b, 0);
    let totalAvail = Math.max(0, totalLim - totalUsed);
    let usedPercent = totalLim > 0 ? Math.min(100, Math.round((totalUsed / totalLim) * 100)) : 0;

    document.getElementById('total-limit-text').innerText = `Total Limit: ₹${totalLim.toLocaleString()}`;
    document.getElementById('total-used-text').innerText = `Total Used: ₹${totalUsed.toLocaleString()}`;
    document.getElementById('total-avail-text').innerText = `Available: ₹${totalAvail.toLocaleString()}`;
    document.getElementById('ring-percentage').textContent = `${usedPercent}%`;
    document.getElementById('utilization-ring').setAttribute('stroke-dasharray', `${usedPercent}, 100`);

    const statusEl = document.getElementById('utilization-status');
    const ringEl = document.getElementById('utilization-ring');
    if (usedPercent <= 10) {
        statusEl.innerText = 'Excellent (<10%)'; statusEl.style.color = 'var(--success)'; ringEl.style.stroke = 'var(--success)';
    } else if (usedPercent <= 30) {
        statusEl.innerText = 'Good (≤30%)'; statusEl.style.color = 'var(--primary)'; ringEl.style.stroke = 'var(--primary)';
    } else {
        statusEl.innerText = 'High (>30%)'; statusEl.style.color = 'var(--danger)'; ringEl.style.stroke = 'var(--danger)';
    }

    // Total Rewards Breakdown
    let totalRewards = 0;
    let catRewards = {};
    transactions.forEach(tx => {
        let r = parseFloat(tx.rewardEarned) || 0;
        if (r > 0) {
            let netR = tx.type === 'refund' ? -r : r;
            totalRewards += netR;
            let cat = tx.category || 'Others';
            catRewards[cat] = (catRewards[cat] || 0) + netR;
        }
    });
    document.getElementById('vault-total-rewards').innerText = `₹${totalRewards.toLocaleString()}`;
    const rewBreakdownEl = document.getElementById('vault-rewards-breakdown');
    if (Object.keys(catRewards).length === 0) {
        rewBreakdownEl.innerHTML = `<i style="color:var(--text-muted);">Log rewards when adding spends or bill payments to see category-wise cashback analytics here.</i>`;
    } else {
        rewBreakdownEl.innerHTML = Object.entries(catRewards)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-color);"><span>${cat}</span><strong style="color:var(--success);">+₹${amt.toLocaleString()}</strong></div>`)
            .join('');
    }

    // Render Individual Cards in Vault
    let displayCards = cards.filter(c => {
        if(filter === 'active') return !c.isClosed;
        if(filter === 'closed') return c.isClosed;
        return true;
    });

    grid.innerHTML = displayCards.length === 0 ? '<p style="color:var(--text-muted);">No cards found.</p>' : '';
    
    displayCards.forEach(card => {
        let m = getCardLimitMetrics(card);
        let cardRew = getCardTotalRewards(card.id);
        let statHtml = card.isClosed
            ? '<span style="color:var(--danger); font-size:0.8rem; font-weight:bold;">CLOSED</span>'
            : `<span style="font-size:0.82rem;">Used: ₹${m.ownUsed.toLocaleString()} <small style="color:var(--text-muted);">(${m.utilPercent}%)</small></span>`;
        
        grid.innerHTML += `
            <details class="vault-card">
                <summary>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:12px; height:12px; border-radius:50%; background:${card.color};"></div>
                        ${card.name}
                    </div>
                    <div>${statHtml}</div>
                </summary>
                <div class="vault-card-body">
                    <p style="margin-bottom:6px;"><strong>Available Limit:</strong> <span style="color:var(--primary); font-weight:bold;">₹${m.available.toLocaleString()}</span> / ₹${m.limit.toLocaleString()}</p>
                    <p style="margin-bottom:6px;"><strong>Card Used:</strong> ₹${m.ownUsed.toLocaleString()} ${m.isShared ? `(Shared Group "${card.sharedGroup}" Pool Used: ₹${m.poolUsed.toLocaleString()})` : ''}</p>
                    <p style="margin-bottom:6px;"><strong>Rewards Earned:</strong> <span style="color:var(--success); font-weight:bold;">₹${cardRew.toLocaleString()}</span></p>
                    <p style="margin-bottom:6px;"><strong>First Statement:</strong> ${card.firstDate} (${card.graceDays} Days Grace)</p>
                    <p style="margin-bottom:12px;"><strong>Autopay:</strong> ${card.autopay ? 'Enabled' : 'Disabled'}</p>
                    <div class="form-row">
                        <button class="btn-action" style="flex:1;" onclick="openAddEditModal(${card.id})">Edit Card</button>
                        <button class="btn-primary btn-sm" style="flex:1;" onclick="openTxModal(null, ${card.id})">+ Log Entry</button>
                    </div>
                </div>
            </details>
        `;
    });
}

// Modals
function toggleModal(id, show) {
    document.getElementById(id).classList.toggle('active', show);
}

function showConfirm(title, message, callback) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    confirmCallback = callback;
    toggleModal('confirmModal', true);
}

function executeConfirm() {
    if(confirmCallback) confirmCallback();
    toggleModal('confirmModal', false);
}

function openAddEditModal(id = null) {
    editingCardId = id;
    const delBtn = document.getElementById('btn-delete-card');
    
    if (id) {
        let card = cards.find(c => c.id === id);
        document.getElementById('modal-title').innerText = "Edit Card";
        document.getElementById('cardName').value = card.name;
        document.getElementById('firstDate').value = card.firstDate;
        document.getElementById('graceDays').value = card.graceDays;
        document.getElementById('cardLimit').value = card.limit;
        document.getElementById('sharedGroup').value = card.sharedGroup || '';
        document.getElementById('autopay').checked = card.autopay;
        document.getElementById('isClosed').checked = card.isClosed;
        document.getElementById('cardColor').value = card.color || '#1e3a8a';
        document.getElementById('cardPattern').value = card.pattern || 'none';
        delBtn.style.display = 'block';
    } else {
        document.getElementById('modal-title').innerText = "Add New Card";
        document.getElementById('cardName').value = '';
        document.getElementById('firstDate').value = '';
        document.getElementById('graceDays').value = '';
        document.getElementById('cardLimit').value = '';
        document.getElementById('sharedGroup').value = '';
        document.getElementById('autopay').checked = false;
        document.getElementById('isClosed').checked = false;
        document.getElementById('cardColor').value = '#1e3a8a';
        document.getElementById('cardPattern').value = 'none';
        delBtn.style.display = 'none';
    }
    toggleModal('cardModal', true);
}

function saveCard() {
    let payload = {
        name: document.getElementById('cardName').value,
        firstDate: document.getElementById('firstDate').value,
        graceDays: parseInt(document.getElementById('graceDays').value),
        limit: parseFloat(document.getElementById('cardLimit').value),
        sharedGroup: document.getElementById('sharedGroup').value,
        autopay: document.getElementById('autopay').checked,
        isClosed: document.getElementById('isClosed').checked,
        color: document.getElementById('cardColor').value,
        pattern: document.getElementById('cardPattern').value
    };
    
    if(!payload.name || !payload.firstDate || !payload.graceDays || !payload.limit) {
        showConfirm("Incomplete", "Please fill all required fields.", null); return;
    }

    if (editingCardId) {
        let oldCard = cards.find(c => c.id === editingCardId);
        if(payload.isClosed && !oldCard.isClosed) payload.closeDate = simulatedDate.toISOString();
        else if(!payload.isClosed) payload.closeDate = null;
        
        let idx = cards.findIndex(c => c.id === editingCardId);
        cards[idx] = { ...cards[idx], ...payload };
    } else {
        payload.id = Date.now();
        if(payload.isClosed) payload.closeDate = simulatedDate.toISOString();
        cards.push(payload);
    }
    
    localStorage.setItem('maxi_cards_v4', JSON.stringify(cards));
    toggleModal('cardModal', false);
    updateDashboard();
}

function deleteCard() {
    showConfirm("Delete Card", "Permanently delete this card, its payment history, and all its transactions? This cannot be undone.", () => {
        cards = cards.filter(c => c.id !== editingCardId);
        for (let key in paidCycles) { if (key.startsWith(editingCardId + '_')) delete paidCycles[key]; }
        transactions = transactions.filter(t => String(t.cardId) !== String(editingCardId));
        localStorage.setItem('maxi_cards_v4', JSON.stringify(cards));
        localStorage.setItem('maxi_paid_v4', JSON.stringify(paidCycles));
        saveTransactionsToStorage();
        toggleModal('cardModal', false);
        updateDashboard();
    });
}

// ---- INTERCONNECTED BILL PAYMENT & LEDGER SYNC ----
function togglePayment(cycleKey, cardName, cardId, isPaid, event) {
    if(event) event.stopPropagation(); 
    if (isPaid) {
        showConfirm("Unmark Payment", `Are you sure you want to unmark the bill payment for ${cardName}? (Any linked Ledger payment entry will also be removed)`, () => {
            let rec = getPaidRecord(cycleKey);
            if (rec && rec.txId) {
                transactions = transactions.filter(t => t.id !== rec.txId);
                saveTransactionsToStorage();
            }
            delete paidCycles[cycleKey];
            localStorage.setItem('maxi_paid_v4', JSON.stringify(paidCycles));
            document.getElementById('date-details-panel').classList.add('hidden');
            updateDashboard();
        });
    } else {
        pendingPayCycle = cycleKey;
        pendingPayCardId = cardId;
        let currentUsed = getCardUsedBalance(cardId);
        document.getElementById('pay-modal-desc').innerText = `Marking cycle paid for ${cardName}. Entering an amount will also log a payment in the Ledger and restore your available limit.`;
        document.getElementById('paymentDateInput').value = simulatedDate.toISOString().split('T')[0];
        document.getElementById('paymentAmountInput').value = currentUsed > 0 ? currentUsed : '';
        document.getElementById('paymentModeInput').value = '';
        document.getElementById('paymentRewardInput').value = '';
        toggleModal('paymentModal', true);
    }
}

function confirmPayment() {
    let pDate = document.getElementById('paymentDateInput').value;
    let pAmt = parseFloat(document.getElementById('paymentAmountInput').value) || 0;
    let pMode = document.getElementById('paymentModeInput').value.trim();
    let pRew = parseFloat(document.getElementById('paymentRewardInput').value) || 0;

    if(!pDate) return; 
    if (pendingPayCycle) {
        let linkedTxId = null;
        if (pAmt > 0 && pendingPayCardId) {
            linkedTxId = Date.now();
            transactions.push({
                id: linkedTxId,
                cardId: Number(pendingPayCardId),
                type: 'payment',
                amount: pAmt,
                date: pDate,
                category: 'Bill Payment',
                merchant: pMode || 'Bill Payment',
                rewardEarned: pRew,
                description: `Statement Cycle Payment (${pendingPayCycle.split('_')[1]})`
            });
            saveTransactionsToStorage();
        }

        paidCycles[pendingPayCycle] = { date: pDate, amount: pAmt, txId: linkedTxId };
        localStorage.setItem('maxi_paid_v4', JSON.stringify(paidCycles));
        document.getElementById('date-details-panel').classList.add('hidden');
        updateDashboard();
    }
    toggleModal('paymentModal', false);
}

setTimeout(updateDashboard, 100);
