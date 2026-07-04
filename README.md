# Smart Habit Tracking

A full-stack smart habit tracking app built with vanilla JavaScript, Node.js, Express, and a JSON-backed local data store. It now includes richer habit management, interactive check-ins, analytics, gamification, notifications, and AI-style recommendations.

## Features

- User signup and login with hashed passwords
- Add, edit, archive, duplicate, delete, search, filter, and sort habits
- Habit metadata: category, priority, difficulty, color, reminder time, repeat, goal days, and description
- Interactive smart check-ins: Yes, No with missed reason, and Snooze
- XP, coins, levels, streaks, achievement badges, and motivational notifications
- Dashboard analytics with productivity score, completion rate, weekly progress, predictions, mood summary, and recommendations
- Mood tracking with daily mood options
- Analytics page with category performance, recent activity, and yearly heat map
- Downloadable text progress report
- Responsive UI with light, dark, sage, and amber themes

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js and Express
- Auth helpers: bcryptjs and JWT
- Data store: JSON file for local/demo persistence

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
DATABASE_PATH=./habits-data.json
JWT_SECRET=replace-with-a-long-random-secret
```

`DATABASE_PATH` is optional locally. If it is omitted, the app writes to `habits-data.json` in the project root.

## Deploy On Render

1. Push this project to GitHub.
2. Create a new Render Web Service from the GitHub repository.
3. Use these settings:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
4. Add environment variables for `JWT_SECRET` and, if desired, `DATABASE_PATH`.

For production data that must never disappear, use a persistent disk or migrate the storage layer to MongoDB/PostgreSQL.
## Run In VS Code

1. Open VS Code.
2. Go to **File > Open Folder** and select `D:\deva\adhi mini project`.
3. Open a terminal in VS Code and run:

```bash
npm install
```

4. Start the app using either method:
   - Press `F5`, select **Run Smart Habit App**, and click Run.
   - Or run this in the VS Code terminal:

```bash
npm run dev
```

5. Open the app:

```text
http://localhost:3000
```

For another device on the same Wi-Fi, use the **Network URL** printed in the VS Code terminal, for example:

```text
http://YOUR-LAN-IP:3000
```

If port `3000` is already in use, stop the old server with `Ctrl+C` in its terminal, then run `npm run dev` again.
## Email Notifications

The app can save a user's Gmail/email address, then send test notifications and habit notifications through configured Gmail/SMTP credentials.

Email/Gmail setup:

```text
GMAIL_USER=youraddress@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
MAIL_FROM=youraddress@gmail.com
```

For Gmail, enable 2-step verification on the Google account and create an App Password. Use that App Password, not your normal Gmail password.

If Gmail/SMTP credentials are not configured, notifications are still saved in the app and the delivery status will show that email was skipped.

