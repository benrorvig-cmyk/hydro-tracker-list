# Hydro Tracker

Shared project board for Benjamin & Boone, with blind-spot flagging.

## What changed from the Claude artifact version

The Claude artifact used `window.storage`, which only exists inside Claude's
sandbox. This version replaces it with:
- `src/storage.js` — calls a `/api/storage` endpoint from the browser
- `api/storage.js` — a Vercel serverless function backed by **Vercel KV**
  (a hosted Redis store) for real shared, persistent storage
- A 15-second poll so each of you picks up the other's changes automatically

## Deploy steps

### 1. Push this folder to GitHub
```bash
cd hydro-tracker
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

### 2. Import into Vercel
1. Go to https://vercel.com/new
2. Import the GitHub repo you just pushed
3. Framework preset: Vercel should auto-detect **Vite** — leave build settings as default
4. Click **Deploy** (it will fail once, on the first pass, because KV isn't set up yet — that's fine)

### 3. Add a Vercel KV store
1. In your new Vercel project, go to the **Storage** tab
2. Click **Create Database** → **KV**
3. Give it a name (e.g. `hydro-tracker-kv`) and create it
4. On the "Connect Project" step, connect it to this project — Vercel will
   automatically add the required environment variables
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.)

### 4. Redeploy
1. Go to the **Deployments** tab
2. Click the "..." menu on the latest deployment → **Redeploy**
   (this picks up the new KV environment variables)

### 5. Share the link
Vercel gives you a URL like `hydro-tracker.vercel.app`. Send that to Boone —
you'll both be working off the same board.

## Local development (optional)
```bash
npm install
vercel dev
```
`vercel dev` (from the Vercel CLI, `npm i -g vercel`) is needed instead of
plain `vite dev` so the `/api/storage` function runs locally too. You'll need
to run `vercel link` and `vercel env pull` first so it has KV credentials.
