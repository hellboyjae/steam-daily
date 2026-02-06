# 🎮 Steam Daily (Vercel Edition)

A daily Steam-themed puzzle game. Three minigames, new puzzles every day.

## Quick Start (Local)

```bash
npm install
npm run bootstrap    # creates sample 60-game database
npx vercel dev       # starts local dev server
# → Visit http://localhost:3000
```

## Deploy to Vercel

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/steam-daily.git
git push -u origin main
```

### Step 2: Deploy

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Vercel auto-detects the config. Click **Deploy**.
4. Your site is live at `https://steam-daily.vercel.app` (or similar)

### Step 3: Cron runs automatically

Vercel reads `vercel.json` and runs `/api/cron/generate` daily at 5 AM UTC.
Puzzles are also pre-generated for 30 days at build time, so they're always available.

## How It Works

```
steam-daily/
├── public/index.html        ← Complete frontend (static)
├── api/
│   ├── puzzle.js             ← GET /api/puzzle → today's puzzle
│   ├── search.js             ← GET /api/search?q=... → autocomplete
│   └── cron/generate.js      ← Vercel Cron (daily at 5AM UTC)
├── lib/puzzle-generator.js   ← Shared generation logic
├── data/
│   ├── games.json            ← Game database
│   ├── tags.json             ← Tag index
│   └── puzzles/              ← Pre-generated daily JSONs
├── scripts/
│   ├── bootstrap-sample.js   ← Quick 60-game sample DB
│   ├── build-database.js     ← Full 2000+ game DB from Steam APIs
│   └── pregenerator.js       ← Build-time: generates next 30 days
└── vercel.json               ← Cron + routing config
```

## Upgrading to Real Data

```bash
# Replace sample with real Steam data (takes 1-2 hours):
npm run build-db

# Re-generate puzzles:
npm run prebuild

# Commit and push — Vercel auto-deploys
git add data/
git commit -m "Update game database"
git push
```

## Legal

Not affiliated with Valve or Steam. All data from public APIs.
