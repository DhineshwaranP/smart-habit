let currentUser = JSON.parse(localStorage.getItem('smartHabitUser') || 'null');
let currentDashboard = null;
let currentHabits = [];
let isLoginMode = true;

const categories = ['Study', 'Fitness', 'Exercise', 'Reading', 'Meditation', 'Water Intake', 'Coding', 'Health', 'Finance', 'Custom'];
const moods = ['Happy', 'Neutral', 'Sad', 'Stressed', 'Excited'];

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
}

const PERSIST_DB = 'smartHabitPersistence';
const PERSIST_STORE = 'snapshots';

function openPersistentStore() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(PERSIST_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(PERSIST_STORE, { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function writeSnapshotRecord(record) {
    const db = await openPersistentStore();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PERSIST_STORE, 'readwrite');
        tx.objectStore(PERSIST_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }).finally(() => db.close());
}

async function readSnapshotRecord(key) {
    const db = await openPersistentStore();
    return new Promise((resolve, reject) => {
        const request = db.transaction(PERSIST_STORE, 'readonly').objectStore(PERSIST_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    }).finally(() => db.close());
}

async function savePersistentSnapshot(snapshot) {
    if (!snapshot?.user?.id) return;
    const record = { key: `user-${snapshot.user.id}`, snapshot, savedAt: new Date().toISOString() };
    await writeSnapshotRecord(record);
    await writeSnapshotRecord({ ...record, key: 'active' });
}

async function readPersistentSnapshot(userId = currentUser?.id) {
    const record = userId ? await readSnapshotRecord(`user-${userId}`) : await readSnapshotRecord('active');
    return record?.snapshot || null;
}

async function persistServerSnapshot() {
    if (!currentUser?.id) return;
    try {
        const snapshot = await api(`/api/snapshot/${currentUser.id}`, { skipRestore: true });
        await savePersistentSnapshot(snapshot);
    } catch (err) {
        console.warn('Unable to persist snapshot:', err.message);
    }
}

async function refreshPersistentSnapshot() {
    currentDashboard = null;
    await loadDashboard();
}

async function restoreServerSnapshot() {
    const snapshot = await readPersistentSnapshot();
    if (!snapshot?.user?.id) return false;
    const res = await fetch('/api/snapshot/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot })
    });
    if (!res.ok) return false;
    const restored = await res.json();
    currentUser = { ...currentUser, ...restored.user };
    localStorage.setItem('smartHabitUser', JSON.stringify(currentUser));
    await savePersistentSnapshot(restored);
    return true;
}

function clearStoredSession(message = 'Your saved login expired. Please sign in again.') {
    currentUser = null;
    currentDashboard = null;
    currentHabits = [];
    localStorage.removeItem('smartHabitUser');
    showPage('auth-page');
    showToast(message);
}

async function api(url, options = {}) {
    const { skipRestore = false, ...fetchOptions } = options;
    const res = await fetch(url, {
        ...fetchOptions,
        headers: { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (!skipRestore && res.status === 404 && data.error === 'User not found' && currentUser) {
            const restored = await restoreServerSnapshot();
            if (restored) return api(url, { ...fetchOptions, skipRestore: true });
            clearStoredSession('No saved data was found. Please sign in again.');
        }
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.getElementById('nav-links').classList.toggle('hidden', !currentUser);
    if (currentUser) document.getElementById('user-greeting').textContent = currentUser.name;
    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'habits') loadHabits();
    if (pageId === 'progress') renderAnalytics();
    if (pageId === 'rewards') renderRewards();
    if (pageId === 'notifications') renderNotifications();
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').textContent = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('auth-submit').textContent = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('name-group').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-switch-text').textContent = isLoginMode ? "Don't have an account?" : 'Already have an account?';
    document.getElementById('auth-name').required = !isLoginMode;
}

async function handleAuth(event) {
    event.preventDefault();
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    try {
        const payload = {
            email: document.getElementById('auth-email').value,
            password: document.getElementById('auth-password').value
        };
        if (!isLoginMode) payload.name = document.getElementById('auth-name').value;
        currentUser = await api(isLoginMode ? '/api/login' : '/api/signup', { method: 'POST', body: JSON.stringify(payload) });
        localStorage.setItem('smartHabitUser', JSON.stringify(currentUser));
        showPage('dashboard');
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function logout() {
    currentUser = null;
    currentDashboard = null;
    currentHabits = [];
    localStorage.removeItem('smartHabitUser');
    showPage('landing-page');
}

async function loadDashboard() {
    if (!currentUser) return;
    currentDashboard = await api(`/api/dashboard/${currentUser.id}`);
    currentUser = { ...currentUser, ...currentDashboard.user };
    localStorage.setItem('smartHabitUser', JSON.stringify(currentUser));
    currentHabits = currentDashboard.habits.filter((habit) => !habit.archived);
    renderDashboard();
    persistServerSnapshot();
}

function renderDashboard() {
    const stats = currentDashboard.stats;
    document.getElementById('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    document.getElementById('ai-recommendation').textContent = currentDashboard.recommendation;
    document.getElementById('streak-count').textContent = `${stats.currentStreak} days`;
    document.getElementById('completed-count').textContent = `${stats.completedToday}/${stats.totalHabits}`;
    document.getElementById('xp-count').textContent = `${stats.xp} / ${stats.coins}`;
    document.getElementById('score-count').textContent = `${stats.productivityScore}`;
    document.getElementById('completion-rate').textContent = `${stats.completionRate}%`;
    document.getElementById('ring-value').textContent = `${stats.completionRate}%`;
    document.querySelector('.progress-ring').style.setProperty('--progress', `${stats.completionRate * 3.6}deg`);
    document.getElementById('mood-summary').textContent = stats.moodSummary;
    renderTodayHabits();
    renderMood();
    renderPredictions();
    renderWeeklyBars();
}

function logForHabit(habitId) {
    return currentDashboard.todayLogs.find((log) => Number(log.habit_id) === Number(habitId));
}

function renderTodayHabits() {
    const list = document.getElementById('today-habits-list');
    if (!currentHabits.length) {
        list.innerHTML = '<div class="empty-state">No active habits yet. Create one from Habit Management.</div>';
        return;
    }
    list.innerHTML = currentHabits.map((habit) => {
        const log = logForHabit(habit.id);
        const status = log ? log.status : 'pending';
        return `
            <article class="habit-item ${status}">
                <div class="habit-color" style="background:${escapeHtml(habit.color)}"></div>
                <div class="habit-info">
                    <h4>${escapeHtml(habit.habit_name)}</h4>
                    <span>${escapeHtml(habit.category)} � ${escapeHtml(habit.time)} � ${escapeHtml(habit.priority)} priority</span>
                    <small>Streak ${habit.current_streak || 0} days � Prediction ${predictionLabel(habit)}</small>
                </div>
                <div class="checkin-actions">
                    <button class="icon-btn success" onclick="checkIn(${habit.id}, 'completed')" title="Yes, completed">Yes</button>
                    <button class="icon-btn danger" onclick="askMissReason(${habit.id})" title="No, missed">No</button>
                    <button class="icon-btn" onclick="checkIn(${habit.id}, 'snoozed')" title="Remind me later">Snooze</button>
                </div>
            </article>
        `;
    }).join('');
}

function askMissReason(habitId) {
    const reason = prompt('Why was this missed? Busy, Forgot, Sick, Not Motivated, or Other', 'Busy') || 'Other';
    checkIn(habitId, 'missed', reason);
}

async function checkIn(habitId, status, reason = '') {
    try {
        const payload = { habit_id: habitId, date: todayIso(), status, completed: status === 'completed' ? 1 : 0, reason, snooze_minutes: 30 };
        const result = await api('/api/checkin', { method: 'POST', body: JSON.stringify(payload) });
        showToast(result.message || 'Reminder snoozed');
        await loadDashboard();
    } catch (err) {
        showToast(err.message);
    }
}

function renderMood() {
    document.getElementById('mood-grid').innerHTML = moods.map((mood) => `<button class="mood-btn" onclick="saveMood('${mood}')">${mood}</button>`).join('');
}

async function saveMood(mood) {
    await api('/api/mood', { method: 'POST', body: JSON.stringify({ user_id: currentUser.id, mood, date: todayIso() }) });
    showToast(`Mood saved: ${mood}`);
    loadDashboard();
}

function predictionLabel(habit) {
    const attempts = (habit.completion_count || 0) + (habit.missed_count || 0);
    const rate = attempts ? habit.completion_count / attempts : 0.5;
    if ((habit.current_streak || 0) >= 7 || rate >= 0.8) return 'High';
    if ((habit.current_streak || 0) >= 2 || rate >= 0.5) return 'Medium';
    return 'Low';
}

function renderAiFeatures() {
    const advanced = currentDashboard?.advanced || currentDashboard?.analytics?.advanced;
    if (!advanced) return;
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('ai-habit-rec', advanced.habitRecommendation);
    set('ai-schedule', advanced.scheduleSuggestion);
    set('ai-failure', advanced.failureRisks.length ? advanced.failureRisks.map((risk) => `${risk.name}: ${risk.suggestion}`).join(' ') : 'No high-risk habits right now.');
    set('ai-motivation', advanced.motivation);
    set('ai-burnout', advanced.burnout);
    set('daily-challenge', advanced.challenges.daily);
    set('weekly-challenge', advanced.challenges.weekly);
    set('monthly-challenge', advanced.challenges.monthly);
    renderGoalProgress(advanced.goalProgress || []);
}

function renderGoalProgress(items) {
    const el = document.getElementById('goal-progress-list');
    if (!el) return;
    el.innerHTML = items.length ? items.map((item) => `<div class="bar-row"><span>${escapeHtml(item.name)}</span><div><i style="width:${item.value}%"></i></div><b>${item.value}%</b></div>`).join('') : '<div class="empty-state small">No goal progress yet.</div>';
}

async function askAiAssistant(event) {
    event.preventDefault();
    const input = document.getElementById('ai-chat-question');
    const answerEl = document.getElementById('ai-chat-answer');
    const question = input.value.trim();
    if (!question) return;
    answerEl.textContent = 'Thinking...';
    try {
        const data = await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ user_id: currentUser.id, question }) });
        answerEl.textContent = data.answer;
        input.value = '';
    } catch (err) {
        answerEl.textContent = err.message;
    }
}
function renderPredictions() {
    const el = document.getElementById('prediction-list');
    const predictions = currentDashboard.analytics.prediction || [];
    el.innerHTML = predictions.length ? predictions.map((item) => `<div class="prediction-row"><span>${escapeHtml(item.name)}</span><strong class="pill ${item.chance.toLowerCase()}">${item.chance}</strong></div>`).join('') : '<div class="empty-state small">No predictions yet.</div>';
}

function renderWeeklyBars() {
    const logsByDay = {};
    currentDashboard.analytics.logs.forEach((log) => { logsByDay[log.date] = (logsByDay[log.date] || 0) + (log.completed ? 1 : 0); });
    const days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const key = date.toISOString().slice(0, 10);
        return { key, label: date.toLocaleDateString(undefined, { weekday: 'short' }), value: logsByDay[key] || 0 };
    });
    const max = Math.max(1, ...days.map((day) => day.value));
    document.getElementById('weekly-bars').innerHTML = days.map((day) => `<div class="bar-row"><span>${day.label}</span><div><i style="width:${(day.value / max) * 100}%"></i></div><b>${day.value}</b></div>`).join('');
}

function populateSelects() {
    const options = categories.map((cat) => `<option>${cat}</option>`).join('');
    document.getElementById('habit-category').innerHTML = options;
    document.getElementById('filter-category').innerHTML = '<option value="">All Categories</option>' + options;
}

function openHabitForm(habit = null) {
    document.getElementById('habit-form').classList.remove('hidden');
    document.getElementById('habit-id').value = habit?.id || '';
    document.getElementById('habit-name').value = habit?.habit_name || '';
    document.getElementById('habit-time').value = habit?.time || '07:30';
    document.getElementById('habit-category').value = habit?.category || 'Custom';
    document.getElementById('habit-priority').value = habit?.priority || 'Medium';
    document.getElementById('habit-difficulty').value = habit?.difficulty || 'Medium';
    document.getElementById('habit-repeat').value = habit?.repeat || 'Daily';
    document.getElementById('habit-goal').value = habit?.goal_days || 30;
    document.getElementById('habit-color').value = habit?.color || '#0ea5e9';
    document.getElementById('habit-description').value = habit?.description || '';
}

function closeHabitForm() {
    document.getElementById('habit-form').classList.add('hidden');
    document.getElementById('habit-form').reset();
    document.getElementById('habit-id').value = '';
}

async function saveHabit(event) {
    event.preventDefault();
    if (!currentUser?.id) {
        showToast('Please login before saving habits.');
        showPage('auth-page');
        return;
    }
    const submitButton = event.submitter || document.querySelector('#habit-form button[type="submit"]');
    const originalText = submitButton?.textContent || 'Save Habit';
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';
    }
    try {
        const id = document.getElementById('habit-id').value;
        const payload = {
            user_id: currentUser.id,
            habit_name: document.getElementById('habit-name').value.trim(),
            time: document.getElementById('habit-time').value,
            category: document.getElementById('habit-category').value,
            priority: document.getElementById('habit-priority').value,
            difficulty: document.getElementById('habit-difficulty').value,
            repeat: document.getElementById('habit-repeat').value,
            goal_days: Number(document.getElementById('habit-goal').value || 30),
            color: document.getElementById('habit-color').value,
            description: document.getElementById('habit-description').value,
            icon: 'OK',
            start_date: todayIso()
        };
        if (!payload.habit_name || !payload.time) throw new Error('Title and reminder time are required.');
        await api(id ? `/api/habits/${id}` : '/api/habits', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        closeHabitForm();
        showToast(id ? 'Habit updated' : 'Habit created');
        await loadHabits();
        await refreshPersistentSnapshot();
    } catch (err) {
        showToast(err.message);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    }
}

async function loadHabits() {
    if (!currentUser) return;
    const params = new URLSearchParams({
        search: document.getElementById('habit-search')?.value || '',
        category: document.getElementById('filter-category')?.value || '',
        priority: document.getElementById('filter-priority')?.value || '',
        difficulty: document.getElementById('filter-difficulty')?.value || '',
        date: document.getElementById('filter-date')?.value || '',
        status: document.getElementById('filter-status')?.value || 'active',
        sort: document.getElementById('sort-habits')?.value || 'newest'
    });
    currentHabits = await api(`/api/habits/${currentUser.id}?${params}`);
    renderHabitTable();
}

function renderHabitTable() {
    const el = document.getElementById('all-habits-list');
    if (!currentHabits.length) {
        el.innerHTML = '<div class="empty-state">No habits match these filters.</div>';
        return;
    }
    el.innerHTML = currentHabits.map((habit) => `
        <article class="habit-row">
            <div class="habit-color" style="background:${escapeHtml(habit.color)}"></div>
            <div>
                <h4>${escapeHtml(habit.habit_name)}</h4>
                <p>${escapeHtml(habit.description || 'No description')}</p>
                <small>${escapeHtml(habit.category)} � ${escapeHtml(habit.repeat)} � Goal ${habit.goal_days} days � Streak ${habit.current_streak || 0}</small>
            </div>
            <div class="row-actions">
                <button class="btn small-btn" onclick='openHabitForm(${JSON.stringify(habit).replace(/'/g, '&apos;')})'>Edit</button>
                <button class="btn small-btn" onclick="duplicateHabit(${habit.id})">Duplicate</button>
                <button class="btn small-btn" onclick="archiveHabit(${habit.id})">${habit.archived ? 'Restore' : 'Archive'}</button>
                <button class="btn small-btn danger-btn" onclick="deleteHabit(${habit.id})">Delete</button>
            </div>
        </article>
    `).join('');
}

async function archiveHabit(id) {
    await api(`/api/habits/${id}/archive`, { method: 'POST', body: '{}' });
    showToast('Habit status updated');
    await loadHabits();
    await refreshPersistentSnapshot();
}

async function duplicateHabit(id) {
    await api(`/api/habits/${id}/duplicate`, { method: 'POST', body: '{}' });
    showToast('Habit duplicated');
    await loadHabits();
    await refreshPersistentSnapshot();
}

async function deleteHabit(id) {
    if (!confirm('Delete this habit and its progress history?')) return;
    await api(`/api/habits/${id}`, { method: 'DELETE' });
    showToast('Habit deleted');
    await loadHabits();
    await refreshPersistentSnapshot();
}

async function ensureDashboard() {
    if (!currentDashboard && currentUser) await loadDashboard();
}

async function renderAnalytics() {
    await ensureDashboard();
    if (!currentDashboard) return;
    const advanced = currentDashboard.advanced || currentDashboard.analytics.advanced;
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('daily-rate', `${advanced.daily}%`);
    set('weekly-rate', `${advanced.weekly}%`);
    set('monthly-rate', `${advanced.monthly}%`);
    set('yearly-rate', `${advanced.yearly}%`);
    set('consistency-score', advanced.consistencyScore);
    set('average-completion', `${advanced.averageCompletion}%`);
    set('best-habit', advanced.bestHabit);
    set('weakest-habit', advanced.weakestHabit);
    set('time-analysis', advanced.timeAnalysis);
    set('mood-impact', advanced.moodImpact);

    const heatmap = document.getElementById('heatmap');
    const byDate = {};
    currentDashboard.analytics.logs.forEach((log) => { byDate[log.date] = (byDate[log.date] || 0) + (log.completed ? 1 : 0); });
    heatmap.innerHTML = Array.from({ length: 365 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (364 - i));
        const key = date.toISOString().slice(0, 10);
        const value = byDate[key] || 0;
        return `<span class="heat heat-${Math.min(4, value)}" title="${key}: ${value} completed"></span>`;
    }).join('');

    const categoriesHtml = Object.entries(currentDashboard.analytics.byCategory).map(([cat, count]) => `<div class="bar-row"><span>${escapeHtml(cat)}</span><div><i style="width:${Math.min(100, count * 20)}%"></i></div><b>${count}</b></div>`).join('');
    document.getElementById('category-list').innerHTML = categoriesHtml || '<div class="empty-state small">No category data yet.</div>';
    document.getElementById('recent-activity').innerHTML = currentDashboard.analytics.logs.slice(0, 10).map((log) => `<div class="activity-row"><span>${escapeHtml(log.habit_name)}</span><strong>${log.status}</strong><small>${log.date}</small></div>`).join('') || '<div class="empty-state small">No activity yet.</div>';
    document.getElementById('calendar-grid').innerHTML = advanced.calendarDays.map((day) => `<button class="calendar-day ${day.status}" onclick="showCalendarDay('${day.date}', ${day.completed}, ${day.missed}, ${day.total})"><span>${Number(day.date.slice(-2))}</span><small>${day.completed}/${day.total}</small></button>`).join('');
    renderGoalProgress(advanced.goalProgress || []);
}

function showCalendarDay(date, completed, missed, total) {
    showToast(`${date}: ${completed} completed, ${missed} missed, ${total} total logs`);
}
async function renderRewards() {
    await ensureDashboard();
    const earned = new Set((currentDashboard?.rewards || []).map((reward) => reward.badge_name));
    const badges = [
        ['First Step', 'Complete your first habit'],
        ['3-Day Streak', 'Maintain a 3-day streak'],
        ['Perfect Week', 'Complete habits for 7 days'],
        ['Focus Builder', 'Reach 500 XP'],
        ['Coin Collector', 'Earn 250 coins']
    ];
    document.getElementById('badges-grid').innerHTML = badges.map(([name, desc]) => `<article class="badge-card ${earned.has(name) ? 'unlocked' : 'locked'}"><div class="badge-icon">${earned.has(name) ? 'Unlocked' : 'Locked'}</div><h4>${name}</h4><p>${desc}</p></article>`).join('');
}

function deliveryText(item) {
    const labels = {
        reminder: 'Reminder saved',
        completed: 'Completion update',
        missed: 'Missed habit update',
        snooze: 'Snoozed reminder',
        achievement: 'Achievement update',
        test: 'In-app notification'
    };
    return labels[item.type] || 'In-app notification';
}
async function renderNotifications() {
    await ensureDashboard();
    renderNotificationSettings();
    const list = currentDashboard?.notifications || [];
    document.getElementById('notifications-list').innerHTML = list.length ? list.map((item) => `<article class="notification-card ${item.read ? 'read' : ''}"><div class="notif-icon">${item.type.slice(0, 2).toUpperCase()}</div><div><p>${escapeHtml(item.message)}</p><span>${new Date(item.created_at).toLocaleString()}</span><small>${escapeHtml(deliveryText(item))}</small></div></article>`).join('') : '<div class="empty-state">No notifications yet.</div>';
}

async function downloadReport() {
    if (!currentUser) return;
    const res = await fetch(`/api/reports/${currentUser.id}/pdf`);
    if (!res.ok) {
        showToast('Unable to generate PDF report.');
        return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-habit-report-${todayIso()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
}

function changeTheme(themeName) {
    const root = document.documentElement;
    localStorage.setItem('theme', themeName);
    document.getElementById('theme-selector').value = themeName;
    const themes = {
        light: ['#f4f7f5', '#fffdf8', '#17211f', '#66736f', '#0f9f8f', '#0b7f73', '#d9e3dc'],
        dark: ['#111816', '#17211f', '#f8faf8', '#a6b5b0', '#42d0bd', '#14aa99', '#33433f'],
        sage: ['#f2f8f0', '#fffdf8', '#17361f', '#5b6e5f', '#2f9e6f', '#247d58', '#d8e8d6'],
        amber: ['#fff8ea', '#fffdf8', '#3b2412', '#76593a', '#d9902f', '#b87522', '#f0ddbd']
    };
    const [bg, surface, text, muted, primary, hover, border] = themes[themeName] || themes.light;
    root.style.setProperty('--bg-color', bg);
    root.style.setProperty('--surface-color', surface);
    root.style.setProperty('--text-main', text);
    root.style.setProperty('--text-muted', muted);
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-hover', hover);
    root.style.setProperty('--border-color', border);
}

document.addEventListener('DOMContentLoaded', async () => {
    populateSelects();
    changeTheme(localStorage.getItem('theme') || 'light');
    if (!currentUser) {
        const snapshot = await readPersistentSnapshot(null).catch(() => null);
        if (snapshot?.user) {
            currentUser = snapshot.user;
            localStorage.setItem('smartHabitUser', JSON.stringify(currentUser));
        }
    }
    if (currentUser) showPage('dashboard');
});








