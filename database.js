const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'habits.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDB();
    }
});

function initializeDB() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )`);

        // Habits Table
        db.run(`CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            habit_name TEXT NOT NULL,
            time TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Progress Table
        db.run(`CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            FOREIGN KEY (habit_id) REFERENCES habits (id)
        )`);

        // Rewards Table
        db.run(`CREATE TABLE IF NOT EXISTS rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            badge_name TEXT NOT NULL,
            streak INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        console.log('Database tables verified/created.');
    });
}

module.exports = db;
