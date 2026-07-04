require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const store = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
function getNetworkUrls(port) {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((item) => item && item.family === 'IPv4' && !item.internal)
        .map((item) => `http://${item.address}:${port}`);
}

function printAppUrls(port, message = 'App URL') {
    console.log(`${message}: http://localhost:${port}`);
    const networkUrls = getNetworkUrls(port);
    if (networkUrls.length) {
        networkUrls.forEach((url) => console.log(`Network URL: ${url}`));
    } else {
        console.log('Network URL: No LAN IP found. Check your Wi-Fi/network adapter.');
    }
}

function sendError(res, err, status = 500) {
    console.error(err);
    res.status(status).json({ error: err.message || 'Server error' });
}

function signUser(user) {
    return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function predictionForHabit(habit) {
    const attempts = (habit.completion_count || 0) + (habit.missed_count || 0);
    const rate = attempts ? habit.completion_count / attempts : 0.5;
    if ((habit.current_streak || 0) >= 7 || rate >= 0.8) return 'High';
    if ((habit.current_streak || 0) >= 2 || rate >= 0.5) return 'Medium';
    return 'Low';
}

function getLogsSince(logs, days) {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startKey = start.toISOString().slice(0, 10);
    return logs.filter((log) => log.date >= startKey);
}

function completionRateForLogs(logs) {
    return logs.length ? Math.round((logs.filter((log) => log.completed).length / logs.length) * 100) : 0;
}

function buildAdvancedAnalytics(habits, logs, mood) {
    const activeHabits = habits.filter((habit) => !habit.archived);
    const completedLogs = logs.filter((log) => log.completed);
    const missedLogs = logs.filter((log) => !log.completed);
    const daily = completionRateForLogs(getLogsSince(logs, 1));
    const weekly = completionRateForLogs(getLogsSince(logs, 7));
    const monthly = completionRateForLogs(getLogsSince(logs, 30));
    const yearly = completionRateForLogs(getLogsSince(logs, 365));
    const attemptsByHabit = activeHabits.map((habit) => {
        const habitLogs = logs.filter((log) => Number(log.habit_id) === Number(habit.id));
        const rate = completionRateForLogs(habitLogs);
        return { ...habit, rate, attempts: habitLogs.length };
    });
    const bestHabit = [...attemptsByHabit].sort((a, b) => b.rate - a.rate || b.current_streak - a.current_streak)[0] || null;
    const weakestHabit = [...attemptsByHabit].sort((a, b) => a.rate - b.rate || b.missed_count - a.missed_count)[0] || null;
    const timeBuckets = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    activeHabits.forEach((habit) => {
        const hour = Number(String(habit.time || '00:00').split(':')[0]);
        if (hour < 12) timeBuckets.Morning += 1;
        else if (hour < 17) timeBuckets.Afternoon += 1;
        else if (hour < 21) timeBuckets.Evening += 1;
        else timeBuckets.Night += 1;
    });
    const favoriteTime = Object.entries(timeBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Evening';
    const moodImpact = mood
        ? `${mood.mood} logged today. Compare today's completion with your weekly ${weekly}% rate.`
        : 'Log today\'s mood to compare mood and habit completion.';
    const failureRisks = activeHabits
        .filter((habit) => predictionForHabit(habit) === 'Low' || (habit.missed_count || 0) > (habit.completion_count || 0))
        .map((habit) => ({
            id: habit.id,
            name: habit.habit_name,
            suggestion: 'Lower difficulty, change reminder, or reduce frequency.'
        }));
    const goalProgress = activeHabits.map((habit) => ({
        id: habit.id,
        name: habit.habit_name,
        value: Math.min(100, Math.round(((habit.completion_count || 0) / Math.max(1, habit.goal_days || 30)) * 100))
    }));
    const calendarDays = Array.from({ length: 35 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (34 - index));
        const key = date.toISOString().slice(0, 10);
        const dayLogs = logs.filter((log) => log.date === key);
        const completed = dayLogs.filter((log) => log.completed).length;
        const missed = dayLogs.filter((log) => !log.completed).length;
        const status = !dayLogs.length ? 'empty' : missed === 0 ? 'completed' : completed === 0 ? 'missed' : 'partial';
        return { date: key, completed, missed, total: dayLogs.length, status };
    });
    const tooManyHabits = activeHabits.length >= 7;
    const lowCompletion = weekly < 50 && logs.length >= 3;
    const frequentMisses = missedLogs.length > completedLogs.length && logs.length >= 3;

    return {
        daily,
        weekly,
        monthly,
        yearly,
        consistencyScore: Math.round((weekly * 0.55) + (monthly * 0.3) + (Math.min(100, completedLogs.length * 4) * 0.15)),
        averageCompletion: completionRateForLogs(logs),
        bestHabit: bestHabit ? bestHabit.habit_name : 'Not enough data',
        weakestHabit: weakestHabit ? weakestHabit.habit_name : 'Not enough data',
        timeAnalysis: `Most habits are scheduled in the ${favoriteTime.toLowerCase()}. Try protecting that block.`,
        scheduleSuggestion: `Your current pattern favors ${favoriteTime.toLowerCase()} habits. Consider moving difficult habits there.`,
        habitRecommendation: activeHabits.some((habit) => habit.category === 'Study')
            ? 'You consistently plan study habits. Add a 15-minute revision habit after study time.'
            : 'Add one tiny anchor habit, like a 5-minute planning habit after breakfast.',
        motivation: bestHabit && bestHabit.current_streak > 0
            ? `You've maintained ${bestHabit.habit_name} for ${bestHabit.current_streak} days. Keep it going!`
            : 'One small completion today is enough to restart momentum.',
        moodImpact,
        burnout: tooManyHabits || lowCompletion || frequentMisses
            ? 'Burnout risk detected. Reduce workload and focus on your top priority habits.'
            : 'Burnout risk is low. Keep the routine steady and realistic.',
        failureRisks,
        goalProgress,
        timeBuckets,
        calendarDays,
        challenges: {
            daily: 'Complete one high-priority habit today.',
            weekly: 'Hit at least 70% weekly completion.',
            monthly: 'Earn 300 XP this month.'
        }
    };
}

function answerAiChat(question, dashboard) {
    const q = String(question || '').toLowerCase();
    const advanced = dashboard.advanced;
    if (q.includes('study')) return advanced.habitRecommendation;
    if (q.includes('streak')) return `Your current streak is ${dashboard.stats.currentStreak} days. Protect it by completing the smallest version of one habit today.`;
    if (q.includes('routine') || q.includes('schedule')) return advanced.scheduleSuggestion;
    if (q.includes('consistent') || q.includes('improve')) return 'Choose a fixed reminder, reduce friction, and mark the habit complete immediately after finishing it.';
    return `${advanced.motivation} ${advanced.burnout}`;
}

function buildDashboard(userId) {
    const day = today();
    const user = store.publicUser(store.findUserById(userId));
    if (!user) return null;
    const habits = store.listHabits(userId, { status: 'all', sort: 'time' });
    const logs = store.listProgressForUser(userId);
    const todayLogs = logs.filter((log) => log.date === day);
    const mood = store.moodForDate(userId, day);
    const notifications = store.listNotifications(userId);
    const rewards = store.listRewards(userId);
    const activeHabits = habits.filter((habit) => !habit.archived);
    const completedToday = todayLogs.filter((log) => log.completed).length;
    const longestStreak = habits.reduce((max, habit) => Math.max(max, habit.longest_streak || 0), 0);
    const currentStreak = habits.reduce((max, habit) => Math.max(max, habit.current_streak || 0), 0);
    const completionRate = activeHabits.length ? Math.round((completedToday / activeHabits.length) * 100) : 0;
    const productivityScore = Math.min(100, Math.round((completionRate * 0.7) + (Math.min(currentStreak, 10) * 3)));
    const byCategory = activeHabits.reduce((acc, habit) => {
        acc[habit.category] = (acc[habit.category] || 0) + 1;
        return acc;
    }, {});
    const advanced = buildAdvancedAnalytics(habits, logs, mood);
    return {
        user,
        habits,
        todayLogs,
        mood,
        notifications,
        rewards,
        stats: {
            totalHabits: activeHabits.length,
            completedToday,
            completionRate,
            currentStreak,
            longestStreak,
            xp: user.xp || 0,
            coins: user.coins || 0,
            level: Math.max(1, Math.floor((user.xp || 0) / 200) + 1),
            productivityScore,
            moodSummary: mood?.mood || 'Not logged'
        },
        analytics: {
            logs,
            byCategory,
            prediction: activeHabits.map((habit) => ({ id: habit.id, name: habit.habit_name, chance: predictionForHabit(habit) })),
            weekly: logs.slice(0, 60),
            advanced
        },
        advanced,
        recommendation: aiRecommendation({ habits, logs, mood })
    };
}

function createSimplePdf(lines) {
    const escapedLines = lines.map((line) => String(line).replace(/[()\\]/g, '\\$&'));
    const content = ['BT', '/F1 12 Tf', '50 790 Td', ...escapedLines.flatMap((line, index) => [index ? '0 -18 Td' : '', `(${line}) Tj`]).filter(Boolean), 'ET'].join('\n');
    const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
        `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${object}\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
}
function aiRecommendation({ habits = [], logs = [], mood = null }) {
    const total = logs.length;
    const completed = logs.filter((log) => log.completed).length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const activeHabits = habits.filter((habit) => !habit.archived);
    const weakHabit = activeHabits.find((habit) => (habit.missed_count || 0) > (habit.completion_count || 0));

    if (activeHabits.length >= 6 && completionRate < 60) {
        return 'Burnout risk detected. Focus on your top 3 habits this week and archive the rest temporarily.';
    }
    if (weakHabit) {
        return `${weakHabit.habit_name} is slipping. Try lowering difficulty or moving the reminder to a quieter time.`;
    }
    if (mood && ['Stressed', 'Sad'].includes(mood.mood)) {
        return `Your mood is ${mood.mood.toLowerCase()} today. Pick one tiny win and keep the streak alive with a lighter version.`;
    }
    if (completionRate >= 80 && activeHabits.length) {
        return 'You are highly consistent. Consider adding one low-effort support habit like a 5-minute review.';
    }
    return 'Start small today: complete the easiest habit first, then ride that momentum into the next one.';
}

function getMailTransporter() {
    const host = process.env.SMTP_HOST || (process.env.GMAIL_USER ? 'smtp.gmail.com' : '');
    const user = process.env.SMTP_USER || process.env.GMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
    if (!host || !user || !pass) return null;
    return nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: { user, pass }
    });
}

async function sendEmailNotification(user, subject, message) {
    if (!user?.email || !user.notify_email) return { skipped: true, reason: 'Email notifications disabled or email missing' };
    const transporter = getMailTransporter();
    if (!transporter) return { skipped: true, reason: 'SMTP/Gmail credentials not configured' };
    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER,
        to: user.email,
        subject,
        text: message
    });
    return { sent: true, to: user.email };
}

async function deliverExternalNotification(notification, subject) {
    const user = store.findUserById(notification.user_id);
    const delivery_status = { email: null };
    try {
        delivery_status.email = await sendEmailNotification(user, subject, notification.message);
    } catch (err) {
        delivery_status.email = { sent: false, error: err.message };
    }
    store.updateNotificationDelivery(notification.id, delivery_status);
    return delivery_status;
}

function addNotification(userId, habitId, type, message, payload = {}) {
    const notification = store.addNotification({ user_id: userId, habit_id: habitId || null, type, message, action_payload: payload });
    deliverExternalNotification(notification, `Smart Habit: ${type}`).catch((err) => {
        store.updateNotificationDelivery(notification.id, { external_error: err.message });
    });
    return notification;
}

function awardBadges(userId, habit, completedToday) {
    const badges = [];
    if (completedToday === 1) badges.push(['First Step', 1]);
    if ((habit.current_streak || 0) >= 3) badges.push(['3-Day Streak', habit.current_streak]);
    if ((habit.current_streak || 0) >= 7) badges.push(['Perfect Week', habit.current_streak]);

    badges.forEach(([badge, streak]) => {
        const reward = store.addRewardIfMissing(userId, badge, streak);
        if (reward) addNotification(userId, habit.id, 'achievement', `Achievement unlocked: ${badge}`);
    });
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = store.createUser({ name: name.trim(), email: email.toLowerCase(), password: passwordHash });
        res.json({ ...user, token: signUser(user) });
    } catch (err) {
        if (err.code === 'DUPLICATE_EMAIL') return res.status(400).json({ error: 'Email already exists' });
        sendError(res, err);
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').toLowerCase();
        const user = store.findUserByEmail(email);
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });
        const matches = String(user.password).startsWith('$2')
            ? await bcrypt.compare(req.body.password || '', user.password)
            : user.password === req.body.password;
        if (!matches) return res.status(401).json({ error: 'Invalid email or password' });
        if (!String(user.password).startsWith('$2')) {
            store.updateUser(user.id, { password: await bcrypt.hash(req.body.password, 10) });
        }
        const safeUser = store.publicUser(user);
        res.json({ ...safeUser, token: signUser(safeUser) });
    } catch (err) {
        sendError(res, err);
    }
});

app.put('/api/users/:id/notification-settings', (req, res) => {
    try {
        const patch = {
            email: String(req.body.email || '').toLowerCase().trim(),
            notify_email: req.body.notify_email ? 1 : 0,
        };
        if (!patch.email) return res.status(400).json({ error: 'Email is required' });
        const user = store.updateUser(req.params.id, patch);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/notifications/test', async (req, res) => {
    try {
        const user = store.findUserById(req.body.user_id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const notification = store.addNotification({
            user_id: user.id,
            type: 'test',
            message: 'Smart Habit test notification. Your Gmail/email notification settings are connected.',
            action_payload: { test: true }
        });
        const delivery = await deliverExternalNotification(notification, 'Smart Habit Test Notification');
        res.json({ notification: store.markNotificationRead(notification.id) || notification, delivery });
    } catch (err) {
        sendError(res, err);
    }
});
app.get('/api/dashboard/:userId', (req, res) => {
    try {
        const dashboard = buildDashboard(req.params.userId);
        if (!dashboard) return res.status(404).json({ error: 'User not found' });
        res.json(dashboard);
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/ai/chat', (req, res) => {
    try {
        const dashboard = buildDashboard(req.body.user_id);
        if (!dashboard) return res.status(404).json({ error: 'User not found' });
        res.json({ answer: answerAiChat(req.body.question, dashboard) });
    } catch (err) {
        sendError(res, err);
    }
});

app.get('/api/reports/:userId/pdf', (req, res) => {
    try {
        const dashboard = buildDashboard(req.params.userId);
        if (!dashboard) return res.status(404).json({ error: 'User not found' });
        const lines = [
            'Smart Habit Tracking Report',
            `User: ${dashboard.user.name}`,
            `Completion Today: ${dashboard.stats.completedToday}/${dashboard.stats.totalHabits}`,
            `Daily Rate: ${dashboard.advanced.daily}%`,
            `Weekly Rate: ${dashboard.advanced.weekly}%`,
            `Monthly Rate: ${dashboard.advanced.monthly}%`,
            `Yearly Rate: ${dashboard.advanced.yearly}%`,
            `Consistency Score: ${dashboard.advanced.consistencyScore}`,
            `Productivity Score: ${dashboard.stats.productivityScore}`,
            `Best Habit: ${dashboard.advanced.bestHabit}`,
            `Weakest Habit: ${dashboard.advanced.weakestHabit}`,
            `AI Recommendation: ${dashboard.advanced.habitRecommendation}`,
            `Motivation: ${dashboard.advanced.motivation}`,
            `Burnout: ${dashboard.advanced.burnout}`
        ];
        const pdf = createSimplePdf(lines);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="smart-habit-report-${today()}.pdf"`);
        res.send(pdf);
    } catch (err) {
        sendError(res, err);
    }
});
app.get('/api/habits/:userId', (req, res) => {
    try {
        const { search = '', category = '', status = 'active', sort = 'newest' } = req.query;
        res.json(store.listHabits(req.params.userId, { search, category, status, sort }));
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/habits', (req, res) => {
    try {
        const body = req.body;
        if (!body.user_id || !body.habit_name || !body.time) return res.status(400).json({ error: 'User, habit name, and reminder time are required' });
        const habit = store.createHabit(body);
        addNotification(body.user_id, habit.id, 'reminder', `Reminder set for ${habit.habit_name} at ${habit.time}`, { action: 'checkin' });
        res.json(habit);
    } catch (err) {
        sendError(res, err);
    }
});

app.put('/api/habits/:id', (req, res) => {
    try {
        const habit = store.updateHabit(req.params.id, {
            habit_name: req.body.habit_name,
            description: req.body.description || '',
            category: req.body.category || 'Custom',
            priority: req.body.priority || 'Medium',
            difficulty: req.body.difficulty || 'Medium',
            color: req.body.color || '#0ea5e9',
            icon: req.body.icon || 'OK',
            time: req.body.time,
            repeat: req.body.repeat || 'Daily',
            goal_days: req.body.goal_days || 30,
            start_date: req.body.start_date || today()
        });
        if (!habit) return res.status(404).json({ error: 'Habit not found' });
        res.json(habit);
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/habits/:id/archive', (req, res) => {
    try {
        const habit = store.findHabitById(req.params.id);
        if (!habit) return res.status(404).json({ error: 'Habit not found' });
        res.json(store.updateHabit(req.params.id, { archived: habit.archived ? 0 : 1 }));
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/habits/:id/duplicate', (req, res) => {
    try {
        const habit = store.duplicateHabit(req.params.id);
        if (!habit) return res.status(404).json({ error: 'Habit not found' });
        res.json(habit);
    } catch (err) {
        sendError(res, err);
    }
});

app.delete('/api/habits/:id', (req, res) => {
    try {
        res.json({ deleted: store.deleteHabit(req.params.id) });
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/checkin', (req, res) => {
    try {
        const { habit_id, date = today(), completed, status, reason = '', note = '', snooze_minutes = 30 } = req.body;
        const habit = store.findHabitById(habit_id);
        if (!habit) return res.status(404).json({ error: 'Habit not found' });
        const existing = store.progressForHabitDate(habit_id, date);
        const isComplete = Number(completed) === 1 || status === 'completed';
        const finalStatus = status || (isComplete ? 'completed' : 'missed');
        const xp = isComplete && !existing?.completed ? 20 : 0;
        const coins = isComplete && !existing?.completed ? 10 : 0;

        if (finalStatus === 'snoozed') {
            addNotification(habit.user_id, habit.id, 'snooze', `Snoozed ${habit.habit_name} for ${snooze_minutes} minutes`, { snooze_minutes });
            return res.json({ snoozed: true, message: `We will remind you again in ${snooze_minutes} minutes.` });
        }

        store.upsertProgress({
            habit_id: Number(habit_id),
            date,
            completed: isComplete ? 1 : 0,
            status: finalStatus,
            reason,
            note,
            xp_awarded: xp,
            coins_awarded: coins
        });

        if (isComplete) {
            const gap = habit.last_completed_date ? daysBetween(habit.last_completed_date, date) : 1;
            const currentStreak = gap === 1 ? (habit.current_streak || 0) + 1 : 1;
            const longestStreak = Math.max(habit.longest_streak || 0, currentStreak);
            store.updateHabit(habit_id, {
                current_streak: currentStreak,
                longest_streak: longestStreak,
                completion_count: (habit.completion_count || 0) + (xp ? 1 : 0),
                last_completed_date: date,
                last_status_date: date
            });
            if (xp) {
                const user = store.findUserById(habit.user_id);
                const newXp = (user.xp || 0) + xp;
                store.updateUser(habit.user_id, { xp: newXp, coins: (user.coins || 0) + coins, level: Math.max(1, Math.floor(newXp / 200) + 1) });
            }
            addNotification(habit.user_id, habit.id, 'completed', `Nice work. ${habit.habit_name} completed for +${xp} XP and +${coins} coins.`);
        } else {
            store.updateHabit(habit_id, {
                current_streak: 0,
                missed_count: (habit.missed_count || 0) + 1,
                last_status_date: date
            });
            addNotification(habit.user_id, habit.id, 'missed', `${habit.habit_name} was marked missed. Try a smaller version tomorrow.`);
        }

        const updatedHabit = store.findHabitById(habit_id);
        awardBadges(habit.user_id, updatedHabit, xp ? 1 : 0);
        res.json({ habit: updatedHabit, xp, coins, message: isComplete ? 'Great job. Your streak is growing.' : 'Logged as missed. The plan can adapt from here.' });
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/mood', (req, res) => {
    try {
        const { user_id, date = today(), mood, note = '' } = req.body;
        if (!user_id || !mood) return res.status(400).json({ error: 'User and mood are required' });
        res.json(store.upsertMood({ user_id, date, mood, note }));
    } catch (err) {
        sendError(res, err);
    }
});

app.get('/api/progress/:habitId', (req, res) => {
    try {
        res.json(store.listProgressForHabit(req.params.habitId));
    } catch (err) {
        sendError(res, err);
    }
});

app.post('/api/notifications/:id/read', (req, res) => {
    try {
        const notification = store.markNotificationRead(req.params.id);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        res.json({ read: true });
    } catch (err) {
        sendError(res, err);
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
    console.log('Server started successfully.');
    printAppUrls(PORT, 'Local URL');
    console.log('Keep this terminal open while using the app. Press Ctrl+C to stop the server.');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use, so the app is probably already running.`);
        printAppUrls(PORT, 'Existing Local URL');
        console.error('Use the URLs above, or stop the old server with Ctrl+C and run npm run dev again.');
        process.exit(1);
    }

    console.error('Unable to start server:', err.message);
    process.exit(1);
});









