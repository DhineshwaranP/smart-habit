let currentUser = null;
let currentHabits = [];
let todayProgress = [];
let isLoginMode = true;

// Page Navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    const navLinks = document.getElementById('nav-links');
    if (currentUser) {
        navLinks.classList.remove('hidden');
    } else {
        navLinks.classList.add('hidden');
    }

    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'habits') loadHabits();
}

// Authentication
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('auth-submit').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('name-group').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-switch-text').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    
    // Required fields logic
    document.getElementById('auth-name').required = !isLoginMode;
}

async function handleAuth(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.innerText = '';

    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    const payload = isLoginMode ? { email, password } : { name, email, password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (!res.ok) {
            errorEl.innerText = data.error || 'Authentication failed';
            return;
        }

        currentUser = data;
        document.getElementById('user-greeting').innerText = currentUser.name;
        showPage('dashboard');
    } catch (err) {
        errorEl.innerText = 'Server error. Please try again later.';
    }
}

function logout() {
    currentUser = null;
    showPage('landing-page');
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
}

// Habits & Dashboard
async function loadDashboard() {
    if (!currentUser) return;
    
    // Fetch Habits
    const res = await fetch(`/api/habits/${currentUser.id}`);
    currentHabits = await res.json();
    
    renderTodayHabits();
}

async function loadHabits() {
    if (!currentUser) return;
    const res = await fetch(`/api/habits/${currentUser.id}`);
    currentHabits = await res.json();
    
    const tbody = document.getElementById('all-habits-list');
    tbody.innerHTML = '';
    currentHabits.forEach(habit => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${habit.habit_name}</strong></td>
                <td>🕒 ${habit.time}</td>
                <td class="text-right">
                    <button class="btn small-btn danger-btn" onclick="deleteHabit(${habit.id})">Delete</button>
                </td>
            </tr>
        `;
    });
}

function toggleHabitForm() {
    const form = document.getElementById('habit-form');
    form.classList.toggle('hidden');
}

async function addHabit(event) {
    event.preventDefault();
    const name = document.getElementById('habit-name').value;
    const time = document.getElementById('habit-time').value;

    const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, habit_name: name, time })
    });

    if (res.ok) {
        document.getElementById('habit-name').value = '';
        document.getElementById('habit-time').value = '';
        toggleHabitForm();
        loadHabits();
    }
}

async function deleteHabit(id) {
    if(confirm('Are you sure you want to delete this habit?')) {
        await fetch(`/api/habits/${id}`, { method: 'DELETE' });
        loadHabits();
    }
}

// Render Dashboard Habits
function renderTodayHabits() {
    const list = document.getElementById('today-habits-list');
    list.innerHTML = '';
    
    // Mock local check-in state since we don't have a full date tracking built in this simple script yet
    currentHabits.forEach(habit => {
        const isChecked = false; 
        list.innerHTML += `
            <div class="habit-item" id="habit-item-${habit.id}">
                <div class="habit-info">
                    <h4>${habit.habit_name}</h4>
                    <span>🕒 ${habit.time}</span>
                </div>
                <button class="btn small-btn primary-btn" onclick="checkIn(${habit.id})">Complete</button>
            </div>
        `;
    });
    
    document.getElementById('completed-count').innerText = `0/${currentHabits.length}`;
}

async function checkIn(habitId) {
    const date = new Date().toISOString().split('T')[0];
    const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habitId, date, completed: 1 })
    });

    if(res.ok) {
        const item = document.getElementById(`habit-item-${habitId}`);
        item.classList.add('completed');
        item.querySelector('button').innerText = 'Completed ✓';
        item.querySelector('button').disabled = true;
        item.querySelector('button').style.background = '#10b981';
        
        // Update stats
        const [done, total] = document.getElementById('completed-count').innerText.split('/');
        document.getElementById('completed-count').innerText = `${parseInt(done) + 1}/${total}`;
    }
}

// Theme Switcher Logic
function changeTheme(themeName) {
    const root = document.documentElement;
    localStorage.setItem('theme', themeName);
    
    const selector = document.getElementById('theme-selector');
    if (selector) selector.value = themeName;
    
    if (themeName === 'dark') {
        root.style.setProperty('--bg-color', '#1e293b');
        root.style.setProperty('--surface-color', '#0f172a');
        root.style.setProperty('--text-main', '#f8fafc');
        root.style.setProperty('--text-muted', '#94a3b8');
        root.style.setProperty('--primary', '#38bdf8');
        root.style.setProperty('--primary-hover', '#0ea5e9');
        root.style.setProperty('--border-color', '#334155');
    } else if (themeName === 'lavender') {
        root.style.setProperty('--bg-color', '#ffffff');
        root.style.setProperty('--surface-color', '#faf5ff');
        root.style.setProperty('--text-main', '#3b0764');
        root.style.setProperty('--text-muted', '#701a75');
        root.style.setProperty('--primary', '#a855f7');
        root.style.setProperty('--primary-hover', '#9333ea');
        root.style.setProperty('--border-color', '#f3e8ff');
    } else if (themeName === 'sage') {
        root.style.setProperty('--bg-color', '#ffffff');
        root.style.setProperty('--surface-color', '#f0fdf4');
        root.style.setProperty('--text-main', '#14532d');
        root.style.setProperty('--text-muted', '#166534');
        root.style.setProperty('--primary', '#10b981');
        root.style.setProperty('--primary-hover', '#059669');
        root.style.setProperty('--border-color', '#dcfce7');
    } else if (themeName === 'amber') {
        root.style.setProperty('--bg-color', '#ffffff');
        root.style.setProperty('--surface-color', '#fdfbeb');
        root.style.setProperty('--text-main', '#78350f');
        root.style.setProperty('--text-muted', '#92400e');
        root.style.setProperty('--primary', '#f59e0b');
        root.style.setProperty('--primary-hover', '#d97706');
        root.style.setProperty('--border-color', '#fef3c7');
    } else {
        // Default Light
        root.style.setProperty('--bg-color', '#ffffff');
        root.style.setProperty('--surface-color', '#f8fafc');
        root.style.setProperty('--text-main', '#0f172a');
        root.style.setProperty('--text-muted', '#64748b');
        root.style.setProperty('--primary', '#0ea5e9');
        root.style.setProperty('--primary-hover', '#0284c7');
        root.style.setProperty('--border-color', '#e2e8f0');
    }
}

// Load theme on startup
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    changeTheme(savedTheme);
});
