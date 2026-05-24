# Smart Habit Tracking

A lightweight full-stack habit tracking app built with vanilla JavaScript, Node.js, Express, and SQLite.

## Features

- User signup and login
- Add, view, and delete habits
- Daily habit check-ins
- Progress, rewards, and notification screens
- Theme selector

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js and Express
- Database: SQLite

## Run Locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Copy `.env.example` if you want local environment configuration.

```text
PORT=3000
DATABASE_PATH=./habits.db
```

`DATABASE_PATH` is optional locally. In production, set it to a writable path so SQLite can create and update the database file.

## Deploy On Render

1. Push this project to GitHub.
2. Create a new Render Web Service from the GitHub repository.
3. Use these settings:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
4. Add this environment variable:

```text
DATABASE_PATH=/opt/render/project/src/data/habits.db
```

5. Deploy the service.

The included `render.yaml` contains the same basic settings. For production data that must never disappear, use a host with persistent storage or attach a persistent disk and point `DATABASE_PATH` to that disk.
