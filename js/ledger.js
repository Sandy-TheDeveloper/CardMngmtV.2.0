// ledger.js - Phase 2 Transaction Engine, Shared Limits & Rewards Analytics

let transactions = JSON.parse(localStorage.getItem('maxi_tx_v1')) || [];
let editingTxId = null;
let currentTxType = 'spend';

const DEFAULT_MERCHANTS = [
    'Amazon', 'Flipkart', 'Myntra', 'Swiggy', 'Zomato', 'BigBasket', 'Blinkit',
    'Zepto', 'HPCL', 'IOCL', 'BPCL', 'MakeMyTrip', 'IRCTC', 'Uber', 'Ola',
    'Airtel', 'Jio', 'BookMyShow', 'Tata Neu', 'Reliance Digital', 'Croma'
];

const CATEGORY_ICONS = {
    'Online Shopping': '🛒',
    'Groceries': '🥦',
    'Dining & Food': '🍔',
    'Fuel': '⛽',
    'Utilities & Bills': '⚡',
    'Travel & Flights': '✈️',
    'Entertainment': '🎬',
    'Offline / POS': '🏪',
    'Others': '📦',
    'Bill Payment': '💵',
    'Refund': '↩️'
};

function saveTransactionsToStorage() {
    localStorage.setItem('maxi_tx_v1', JSON.stringify(transactions));
}

// ---- REAL-TIME CREDIT LIMIT & SHARED POOL MATH ----

// 1. Net balance used on a single specific card
function getCardUsedBalance(cardId) {
    let used = 0;
    transactions.forEach(tx => {
        if (String(tx.cardId) !== String(cardId)) return;
        let amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'spend') used += amt;
        else if (tx.type === 'payment' || tx.type === 'refund') used -= amt;
    });
    return Math.max(0, used);
}

// 2. Real-time Available Limit (Accounts for Shared Limit Groups like two SBI cards)
function getCardLimitMetrics(card) {
    let totalLimit = parseFloat(card.limit) || 0;
    let ownUsed = getCardUsedBalance(card.id);
    let poolUsed = ownUsed;

    if (card.sharedGroup && card.sharedGroup.trim() !== '') {
        let groupKey = card.sharedGroup.trim().toLowerCase();
        poolUsed = 0;
        cards.forEach(c => {
            if (!c.isClosed && c.sharedGroup && c.sharedGroup.trim().toLowerCase() === groupKey) {
                poolUsed += getCardUsedBalance(c.id);
            }
        });
    }

    let available = Math.max(0, totalLimit - poolUsed);
    let utilPercent = totalLimit > 0 ? Math.min(100, Math.round((poolUsed / totalLimit) * 100)) : 0;

    return {
        limit: totalLimit,
        ownUsed: ownUsed,
        poolUsed: poolUsed,
        available: available,
        utilPercent: utilPercent,
        isShared: !!(card.sharedGroup && card.sharedGroup.trim() !== '')
    };
}

// 3. Calculate Spends in a specific Statement Cycle
function getCycleSpendTotal(cardId, stmtDate) {
    let prevStmt = new Date(stmtDate);
    prevStmt.setMonth(prevStmt.getMonth() - 1);
    let total = 0;

    transactions.forEach(tx => {
        if (String(tx.cardId) !== String(cardId)) return;
        let d = new Date(tx.date);
        if (d > prevStmt && d <= stmtDate) {
            if (tx.type === 'spend') total += parseFloat(tx.amount) || 0;
            if (tx.type === 'refund') total -= parseFloat(tx.amount) || 0;
        }
    });
    return Math.max(0, total);
}

// 4. Total Rewards Earned by a Card
function getCardTotalRewards(cardId) {
    return transactions
        .filter(tx => String(tx.cardId) === String(cardId))
        .reduce((sum, tx) => {
            let r = parseFloat(tx.rewardEarned) || 0;
            return tx.type === 'refund' ? sum - r : sum + r;
        }, 0);
}

// ---- TRANSACTION MODAL & CRUD ----

function updateMerchantSuggestions() {
    const list = document.getElementById('merchant-suggestions');
    if (!list) return;
    let customMerchants = transactions.map(t => t.merchant).filter(Boolean);
    let unique = [...new Set([...DEFAULT_MERCHANTS, ...customMerchants])].sort();
    list.innerHTML = unique.map(m => `<option value="${m}">`).join('');
}

function setTxType(type) {
    currentTxType = type;
    document.getElementById('type-btn-spend').className = `type-btn ${type === 'spend' ? 'active-spend' : ''}`;
    document.getElementById('type-btn-payment').className = `type-btn ${type === 'payment' ? 'active-payment' : ''}`;
    document.getElementById('type-btn-refund').className = `type-btn ${type === 'refund' ? 'active-refund' : ''}`;

    const catGroup = document.getElementById('tx-category-group');
    const merchLabel = document.getElementById('tx-merchant-label');
    const rewardLabel = document.getElementById('tx-reward-label');

    if (type === 'payment') {
        catGroup.style.display = 'none';
        merchLabel.innerText = 'Paid Via (Platform/Bank)';
        rewardLabel.innerText = 'Bill Cashback (₹)';
        document.getElementById('txMerchant').placeholder = 'e.g. HDFC BillPay, Cred';
    } else if (type === 'refund') {
        catGroup.style.display = 'block';
        merchLabel.innerText = 'Merchant';
        rewardLabel.innerText = 'Reward Deducted (₹)';
        document.getElementById('txMerchant').placeholder = 'e.g. Amazon';
    } else {
        catGroup.style.display = 'block';
        merchLabel.innerText = 'Merchant / Platform';
        rewardLabel.innerText = 'Reward Earned (₹)';
        document.getElementById('txMerchant').placeholder = 'e.g. Amazon, HPCL';
    }
}

function openTxModal(txId = null, prefillCardId = null) {
    if (cards.length === 0) {
        showConfirm("No Cards", "Please add a credit card first before logging transactions.", null);
        return;
    }

    editingTxId = txId;
    updateMerchantSuggestions();

    const cardSelect = document.getElementById('txCardId');
    let availableCards = txId ? cards : cards.filter(c => !c.isClosed);
    cardSelect.innerHTML = availableCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const delBtn = document.getElementById('btn-delete-tx');

    if (txId) {
        let tx = transactions.find(t => t.id === txId);
        if (!tx) return;
        document.getElementById('tx-modal-title').innerText = 'Edit Transaction';
        setTxType(tx.type || 'spend');
        cardSelect.value = tx.cardId;
        document.getElementById('txAmount').value = tx.amount;
        document.getElementById('txDate').value = tx.date;
        document.getElementById('txCategory').value = tx.category || 'Online Shopping';
        document.getElementById('txMerchant').value = tx.merchant || '';
        document.getElementById('txReward').value = tx.rewardEarned || '';
        document.getElementById('txDesc').value = tx.description || '';
        delBtn.style.display = 'block';
    } else {
        document.getElementById('tx-modal-title').innerText = 'Log Transaction';
        setTxType('spend');
        if (prefillCardId) cardSelect.value = prefillCardId;
        document.getElementById('txAmount').value = '';
        document.getElementById('txDate').value = simulatedDate.toISOString().split('T')[0];
        document.getElementById('txCategory').value = 'Online Shopping';
        document.getElementById('txMerchant').value = '';
        document.getElementById('txReward').value = '';
        document.getElementById('txDesc').value = '';
        delBtn.style.display = 'none';
    }

    toggleModal('txModal', true);
}

function saveTransaction() {
    let cardId = document.getElementById('txCardId').value;
    let amount = parseFloat(document.getElementById('txAmount').value);
    let date = document.getElementById('txDate').value;
    let category = currentTxType === 'payment' ? 'Bill Payment' : document.getElementById('txCategory').value;
    let merchant = document.getElementById('txMerchant').value.trim();
    let rewardEarned = parseFloat(document.getElementById('txReward').value) || 0;
    let description = document.getElementById('txDesc').value.trim();

    if (!cardId || !amount || amount <= 0 || !date) {
        showConfirm("Missing Info", "Please enter a valid amount and date.", null);
        return;
    }

    let payload = {
        cardId: Number(cardId),
        type: currentTxType,
        amount: amount,
        date: date,
        category: category,
        merchant: merchant || (currentTxType === 'payment' ? 'Manual Payment' : category),
        rewardEarned: rewardEarned,
        description: description
    };

    if (editingTxId) {
        let idx = transactions.findIndex(t => t.id === editingTxId);
        if (idx > -1) transactions[idx] = { ...transactions[idx], ...payload };
    } else {
        payload.id = Date.now();
        transactions.push(payload);
    }

    saveTransactionsToStorage();
    toggleModal('txModal', false);
    updateDashboard();
}

function deleteTransaction() {
    showConfirm("Delete Entry", "Are you sure you want to delete this transaction from your ledger?", () => {
        transactions = transactions.filter(t => t.id !== editingTxId);
        saveTransactionsToStorage();
        toggleModal('txModal', false);
        updateDashboard();
    });
}

// ---- RENDER LEDGER TAB ----

function renderLedger() {
    const cardFilterEl = document.getElementById('ledger-card-filter');
    if (!cardFilterEl) return;

    // Preserve selected card filter while updating dropdown options
    const currentCardVal = cardFilterEl.value || 'all';
    cardFilterEl.innerHTML = `<option value="all">All Cards</option>` +
        cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    cardFilterEl.value = currentCardVal;

    const searchQuery = (document.getElementById('ledger-search').value || '').toLowerCase();
    const catFilter = document.getElementById('ledger-cat-filter').value;

    let filtered = transactions.filter(tx => {
        if (currentCardVal !== 'all' && String(tx.cardId) !== String(currentCardVal)) return false;

        if (catFilter !== 'all') {
            if (catFilter.startsWith('type:')) {
                let targetType = catFilter.split(':')[1];
                if (tx.type !== targetType) return false;
            } else {
                if (tx.category !== catFilter) return false;
            }
        }

        if (searchQuery) {
            let m = (tx.merchant || '').toLowerCase();
            let d = (tx.description || '').toLowerCase();
            let c = (tx.category || '').toLowerCase();
            let a = String(tx.amount);
            if (!m.includes(searchQuery) && !d.includes(searchQuery) && !c.includes(searchQuery) && !a.includes(searchQuery)) {
                return false;
            }
        }
        return true;
    });

    // Sort newest first
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);

    // Calculate Summary Totals for filtered view
    let sumSpend = 0, sumPay = 0, sumReward = 0;
    filtered.forEach(tx => {
        let amt = parseFloat(tx.amount) || 0;
        let rew = parseFloat(tx.rewardEarned) || 0;
        if (tx.type === 'spend') { sumSpend += amt; sumReward += rew; }
        else if (tx.type === 'payment') { sumPay += amt; sumReward += rew; }
        else if (tx.type === 'refund') { sumSpend = Math.max(0, sumSpend - amt); sumReward -= rew; }
    });

    document.getElementById('ledger-sum-spend').innerText = `₹${sumSpend.toLocaleString()}`;
    document.getElementById('ledger-sum-pay').innerText = `₹${sumPay.toLocaleString()}`;
    document.getElementById('ledger-sum-reward').innerText = `+₹${sumReward.toLocaleString()}`;

    const listEl = document.getElementById('ledger-list');
    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="placeholder-content">No transactions match your filter. Tap "+ Add" to log a spend or payment.</div>`;
        return;
    }

    listEl.innerHTML = filtered.map(tx => {
        let card = cards.find(c => String(c.id) === String(tx.cardId));
        let cardName = card ? card.name : 'Unknown Card';
        let cardColor = card ? card.color : '#64748b';
        let icon = tx.type === 'payment' ? '💵' : (tx.type === 'refund' ? '↩️' : (CATEGORY_ICONS[tx.category] || '🛒'));
        let sign = tx.type === 'spend' ? '-' : '+';
        let dStr = new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        let rew = parseFloat(tx.rewardEarned) || 0;
        let rewardBadge = rew > 0
            ? `<div class="tx-reward-badge">${tx.type === 'refund' ? '-' : '+'}₹${rew.toLocaleString()} CB</div>`
            : '';

        return `
            <div class="tx-card" onclick="openTxModal(${tx.id})">
                <div class="tx-left">
                    <div class="tx-icon">${icon}</div>
                    <div class="tx-info">
                        <h4>
                            ${tx.merchant || tx.category}
                            <span class="tx-card-badge" style="background:${cardColor};">${cardName}</span>
                        </h4>
                        <div class="tx-meta">${dStr} • ${tx.category}</div>
                        ${tx.description ? `<div class="tx-remark">"${tx.description}"</div>` : ''}
                    </div>
                </div>
                <div class="tx-right">
                    <div class="tx-amount ${tx.type}">${sign}₹${Number(tx.amount).toLocaleString()}</div>
                    ${rewardBadge}
                </div>
            </div>
        `;
    }).join('');
}
