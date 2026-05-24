const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// --- Authentication ---
app.post('/api/signup', (req, res) => {
    const { name, email, password } = req.body;
    db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, password], function(err) {
        if (err) {
            if(err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, name, email });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Invalid email or password' });
        res.json({ id: row.id, name: row.name, email: row.email });
    });
});

// --- Habits ---
app.get('/api/habits/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT * FROM habits WHERE user_id = ?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/habits', (req, res) => {
    const { user_id, habit_name, time } = req.body;
    db.run(`INSERT INTO habits (user_id, habit_name, time) VALUES (?, ?, ?)`, [user_id, habit_name, time], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, user_id, habit_name, time });
    });
});

app.delete('/api/habits/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM habits WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes > 0 });
    });
});

// --- Progress & Check-in ---
app.post('/api/checkin', (req, res) => {
    const { habit_id, date, completed } = req.body;
    db.get(`SELECT * FROM progress WHERE habit_id = ? AND date = ?`, [habit_id, date], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            db.run(`UPDATE progress SET completed = ? WHERE id = ?`, [completed, row.id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ updated: true });
            });
        } else {
            db.run(`INSERT INTO progress (habit_id, date, completed) VALUES (?, ?, ?)`, [habit_id, date, completed], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ inserted: true });
            });
        }
    });
});

app.get('/api/progress/:habitId', (req, res) => {
    const { habitId } = req.params;
    db.all(`SELECT * FROM progress WHERE habit_id = ?`, [habitId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Catch All ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
