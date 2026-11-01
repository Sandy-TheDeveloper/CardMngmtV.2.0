// core.js - Global Logic & Drawer
const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

let isDarkMode = localStorage.getItem('maxicard_theme') === 'dark';

function applyTheme() {
    if (isDarkMode) {
        body.classList.add('dark-theme');
        themeToggleBtn.textContent = '☀️';
    } else {
        body.classList.remove('dark-theme');
        themeToggleBtn.textContent = '🌙';
    }
}

themeToggleBtn.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    localStorage.setItem('maxicard_theme', isDarkMode ? 'dark' : 'light');
    applyTheme();
});
applyTheme();

function switchTab(tabId) {
    document.querySelectorAll('.tab-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    const btn = Array.from(document.querySelectorAll('.nav-item')).find(b => b.getAttribute('onclick').includes(tabId));
    if (btn) btn.classList.add('active');
    
    // Refresh UI on tab switch just in case
    if (typeof updateDashboard === "function") updateDashboard();
}

function toggleDrawer(show) {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (show) {
        drawer.classList.remove('hidden');
        overlay.classList.remove('hidden');
    } else {
        drawer.classList.add('hidden');
        overlay.classList.add('hidden');
    }
}
switchTab('home');
