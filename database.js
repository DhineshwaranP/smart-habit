const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'habits-data.json');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const defaultState = {
    counters: { users: 0, habits: 0, progress: 0, rewards: 0, mood_logs: 0, notifications: 0 },
    users: [],
    habits: [],
    progress: [],
    rewards: [],
    mood_logs: [],
    notifications: []
};

function readState() {
    if (!fs.existsSync(dbPath)) return structuredClone(defaultState);
    try {
        const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return {
            counters: { ...defaultState.counters, ...(parsed.counters || {}) },
            users: parsed.users || [],
            habits: parsed.habits || [],
            progress: parsed.progress || [],
            rewards: parsed.rewards || [],
            mood_logs: parsed.mood_logs || [],
            notifications: (parsed.notifications || []).map((item) => ({ delivery_status: {}, ...item }))
        };
    } catch (err) {
        console.error('Unable to read data store, starting fresh:', err.message);
        return structuredClone(defaultState);
    }
}

let state = readState();

function save() {
    fs.writeFileSync(dbPath, JSON.stringify(state, null, 2));
}

function nextId(collection) {
    state.counters[collection] = (state.counters[collection] || 0) + 1;
    return state.counters[collection];
}

function now() {
    return new Date().toISOString();
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function publicUser(user) {
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
}

function createUser({ name, email, password }) {
    if (state.users.some((user) => user.email === email)) {
        const err = new Error('Email already exists');
        err.code = 'DUPLICATE_EMAIL';
        throw err;
    }
    const user = { id: nextId('users'), name, email, password, avatar_url: '', notify_email: 1, xp: 0, coins: 0, level: 1, created_at: now() };
    state.users.push(user);
    save();
    return publicUser(user);
}

function findUserByEmail(email) {
    return state.users.find((user) => user.email === email) || null;
}

function findUserById(id) {
    return state.users.find((user) => Number(user.id) === Number(id)) || null;
}

function updateUser(id, patch) {
    const user = findUserById(id);
    if (!user) return null;
    Object.assign(user, patch);
    save();
    return publicUser(user);
}

function listHabits(userId, filters = {}) {
    let habits = state.habits.filter((habit) => Number(habit.user_id) === Number(userId));
    if (filters.status === 'active') habits = habits.filter((habit) => !habit.archived);
    if (filters.status === 'archived') habits = habits.filter((habit) => habit.archived);
    if (filters.category) habits = habits.filter((habit) => habit.category === filters.category);
    if (filters.search) habits = habits.filter((habit) => habit.habit_name.toLowerCase().includes(filters.search.toLowerCase()));
    const sorters = {
        newest: (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
        oldest: (a, b) => String(a.created_at).localeCompare(String(b.created_at)),
        streak: (a, b) => (b.current_streak || 0) - (a.current_streak || 0),
        completion: (a, b) => (b.completion_count || 0) - (a.completion_count || 0),
        time: (a, b) => String(a.time).localeCompare(String(b.time))
    };
    return [...habits].sort(sorters[filters.sort] || sorters.newest);
}

function findHabitById(id) {
    return state.habits.find((habit) => Number(habit.id) === Number(id)) || null;
}

function createHabit(data) {
    const habit = {
        id: nextId('habits'),
        user_id: Number(data.user_id),
        habit_name: data.habit_name,
        description: data.description || '',
        category: data.category || 'Custom',
        priority: data.priority || 'Medium',
        difficulty: data.difficulty || 'Medium',
        color: data.color || '#0ea5e9',
        icon: data.icon || 'OK',
        time: data.time,
        repeat: data.repeat || 'Daily',
        goal_days: Number(data.goal_days || 30),
        start_date: data.start_date || today(),
        archived: 0,
        current_streak: 0,
        longest_streak: 0,
        completion_count: 0,
        missed_count: 0,
        last_completed_date: '',
        last_status_date: '',
        created_at: now()
    };
    state.habits.push(habit);
    save();
    return habit;
}

function updateHabit(id, patch) {
    const habit = findHabitById(id);
    if (!habit) return null;
    Object.assign(habit, patch, { goal_days: Number(patch.goal_days || habit.goal_days || 30) });
    save();
    return habit;
}

function deleteHabit(id) {
    const before = state.habits.length;
    state.habits = state.habits.filter((habit) => Number(habit.id) !== Number(id));
    state.progress = state.progress.filter((log) => Number(log.habit_id) !== Number(id));
    save();
    return before !== state.habits.length;
}

function duplicateHabit(id) {
    const habit = findHabitById(id);
    if (!habit) return null;
    return createHabit({ ...habit, habit_name: `${habit.habit_name} Copy`, start_date: today() });
}

function progressForHabitDate(habitId, date) {
    return state.progress.find((log) => Number(log.habit_id) === Number(habitId) && log.date === date) || null;
}

function upsertProgress(data) {
    let log = progressForHabitDate(data.habit_id, data.date);
    if (log) {
        Object.assign(log, data);
    } else {
        log = { id: nextId('progress'), created_at: now(), ...data };
        state.progress.push(log);
    }
    save();
    return log;
}

function listProgressForUser(userId) {
    const habitIds = new Set(state.habits.filter((habit) => Number(habit.user_id) === Number(userId)).map((habit) => Number(habit.id)));
    return state.progress
        .filter((log) => habitIds.has(Number(log.habit_id)))
        .map((log) => {
            const habit = findHabitById(log.habit_id);
            return { ...log, habit_name: habit?.habit_name || 'Habit', category: habit?.category || 'Custom' };
        })
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function listProgressForHabit(habitId) {
    return state.progress.filter((log) => Number(log.habit_id) === Number(habitId)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function upsertMood({ user_id, date, mood, note = '' }) {
    let log = state.mood_logs.find((item) => Number(item.user_id) === Number(user_id) && item.date === date);
    if (log) Object.assign(log, { mood, note });
    else {
        log = { id: nextId('mood_logs'), user_id: Number(user_id), date, mood, note };
        state.mood_logs.push(log);
    }
    save();
    return log;
}

function moodForDate(userId, date) {
    return state.mood_logs.find((item) => Number(item.user_id) === Number(userId) && item.date === date) || null;
}

function addNotification({ user_id, habit_id = null, type, message, action_payload = {} }) {
    const notification = { id: nextId('notifications'), user_id: Number(user_id), habit_id, type, message, action_payload, read: 0, created_at: now() };
    state.notifications.push(notification);
    save();
    return notification;
}

function listNotifications(userId) {
    return state.notifications.filter((item) => Number(item.user_id) === Number(userId)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
}

function markNotificationRead(id) {
    const notification = state.notifications.find((item) => Number(item.id) === Number(id));
    if (!notification) return null;
    notification.read = 1;
    save();
    return notification;
}

function updateNotificationDelivery(id, delivery_status) {
    const notification = state.notifications.find((item) => Number(item.id) === Number(id));
    if (!notification) return null;
    notification.delivery_status = { ...(notification.delivery_status || {}), ...delivery_status };
    save();
    return notification;
}
function listRewards(userId) {
    return state.rewards.filter((reward) => Number(reward.user_id) === Number(userId)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function addRewardIfMissing(userId, badge_name, streak = 0) {
    const existing = state.rewards.find((reward) => Number(reward.user_id) === Number(userId) && reward.badge_name === badge_name);
    if (existing) return null;
    const reward = { id: nextId('rewards'), user_id: Number(userId), badge_name, streak, created_at: now() };
    state.rewards.push(reward);
    save();
    return reward;
}
function recalculateCounters() {
    Object.keys(defaultState.counters).forEach((collection) => {
        state.counters[collection] = Math.max(0, ...state[collection].map((item) => Number(item.id) || 0));
    });
}

function upsertById(collection, item) {
    if (!item || item.id === undefined || item.id === null) return;
    const normalized = { ...item, id: Number(item.id) };
    const index = state[collection].findIndex((entry) => Number(entry.id) === normalized.id);
    if (index >= 0) state[collection][index] = { ...state[collection][index], ...normalized };
    else state[collection].push(normalized);
}

function getUserSnapshot(userId) {
    const user = findUserById(userId);
    if (!user) return null;
    const habitIds = new Set(state.habits.filter((habit) => Number(habit.user_id) === Number(userId)).map((habit) => Number(habit.id)));
    return {
        version: 1,
        saved_at: now(),
        user: publicUser(user),
        habits: state.habits.filter((habit) => Number(habit.user_id) === Number(userId)),
        progress: state.progress.filter((log) => habitIds.has(Number(log.habit_id))),
        rewards: state.rewards.filter((reward) => Number(reward.user_id) === Number(userId)),
        mood_logs: state.mood_logs.filter((mood) => Number(mood.user_id) === Number(userId)),
        notifications: state.notifications.filter((notification) => Number(notification.user_id) === Number(userId))
    };
}

function restoreUserSnapshot(snapshot = {}) {
    const user = snapshot.user;
    if (!user?.id || !user?.email) {
        const err = new Error('Snapshot is missing user data');
        err.status = 400;
        throw err;
    }

    const existing = findUserById(user.id) || findUserByEmail(user.email);
    const restoredUser = {
        ...(existing || {}),
        ...user,
        id: Number(user.id),
        email: String(user.email).toLowerCase(),
        password: existing?.password || user.password || ''
    };
    upsertById('users', restoredUser);
    ['habits', 'progress', 'rewards', 'mood_logs', 'notifications'].forEach((collection) => {
        (snapshot[collection] || []).forEach((item) => upsertById(collection, item));
    });
    recalculateCounters();
    save();
    return getUserSnapshot(restoredUser.id);
}

module.exports = {
    publicUser,
    createUser,
    findUserByEmail,
    findUserById,
    updateUser,
    listHabits,
    findHabitById,
    createHabit,
    updateHabit,
    deleteHabit,
    duplicateHabit,
    progressForHabitDate,
    upsertProgress,
    listProgressForUser,
    listProgressForHabit,
    upsertMood,
    moodForDate,
    addNotification,
    listNotifications,
    markNotificationRead,
    updateNotificationDelivery,
    listRewards,
    addRewardIfMissing,
    getUserSnapshot,
    restoreUserSnapshot
};





