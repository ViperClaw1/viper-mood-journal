# Mood Journal

A journaling app where you write your thoughts or mood and receive a response from Claude AI. Backend (Node.js, Express, Prisma, PostgreSQL) runs in Docker; frontend (Vite, Vanilla JS) runs on the host.

**Technical documentation:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (architecture, backend, frontend, data flow, env, Docker) · [docs/API.md](docs/API.md) (API reference).

## Prerequisites

- **Docker** and **Docker Compose** – [Install Docker](https://docs.docker.com/get-docker/)
- **Node.js** and **npm** – only needed to run the frontend dev server

No need to install PostgreSQL or run the backend manually; Docker runs the database and API.

## One-time setup

1. Copy the example env file and set your Anthropic API key:

   ```bash
   cp backend/.env.example backend/.env
   ```

   Edit `backend/.env` and set `ANTHROPIC_API_KEY` (get a key from [Anthropic Console](https://console.anthropic.com/)). Leave `DATABASE_URL` and `PORT` as in the example when using Docker.

## Run the app

1. **Start the backend and database** (from repo root):

   ```bash
   docker compose up --build
   ```

   On first run or with a fresh database, apply migrations in another terminal:

   ```bash
   docker compose exec backend npx prisma migrate deploy
   ```

2. **Start the frontend** (new terminal, from repo root):

   ```bash
   cd frontend && npm install && npm run dev
   ```

   Open the URL Vite prints (e.g. http://localhost:5173). The app proxies `/api` to the backend at http://localhost:3000.

## Verify

- Backend health: `curl http://localhost:3000/health` → `{"status":"ok"}`
- Entries: `curl http://localhost:3000/entries` → JSON array of entries

## Team onboarding

A team member can clone the repo and have the app running without installing Node or Postgres on the host (only Docker and npm for the frontend).

1. `git clone https://github.com/ViperClaw1/mood-journal.git && cd mood-journal`
2. `cp backend/.env.example backend/.env` and set `ANTHROPIC_API_KEY`
3. `docker compose up --build`. Wait until backend and postgres are up.
4. (Optional) `docker compose exec backend npx prisma migrate deploy`
5. `cd frontend && npm install && npm run dev` and open the dev URL
6. Smoke test: submit an entry and confirm history and AI response

## Stakeholder preview with ngrok

To give clients or stakeholders a temporary public URL to try the app:

1. Install [ngrok](https://ngrok.com/) (e.g. download or `choco install ngrok` / `brew install ngrok`).
2. Start the app: `docker compose up -d` and `cd frontend && npm run dev` (Vite on port 5173).
3. In another terminal: `ngrok http 5173`
4. Share the HTTPS URL ngrok prints (e.g. `https://abc123.ngrok.io`). Stakeholders open it in a browser; Vite proxies API calls to the backend.
5. When done, stop ngrok and stop the frontend and Docker stack (`docker compose down`).

**Caveats:** Your machine must stay on and connected. Free ngrok URLs are temporary and change each run. Do not leave ngrok running unattended with sensitive data.

## Production (Railway + Vercel)

The app can be deployed so it is permanently accessible at a public URL. Example live frontend: **https://viper-mood-journal.vercel.app**.

**After backend and frontend are deployed, complete these steps:**

1. **Vercel (frontend):** In project **Settings → Environment Variables**, add `VITE_API_URL` = your Railway backend URL (e.g. `https://your-backend.up.railway.app`) with **no trailing slash**. Redeploy so the new value is baked into the build.
2. **Railway (backend):** In the backend service **Variables**, set `FRONTEND_ORIGIN` = your Vercel URL (e.g. `https://viper-mood-journal.vercel.app`). Redeploy so CORS allows the frontend origin.
3. **Migrations:** The backend runs `prisma migrate deploy` on every start (see `backend/package.json` start script), so the schema is applied automatically when the container starts on Railway. You do not need to run migrations from your local machine (and you can't reach Railway's internal DB host from local anyway).
4. **Verify:** Open the Vercel URL, submit an entry, confirm the AI response and that entries persist after refresh.

- **Backend + PostgreSQL:** Deploy to [Railway](https://railway.app). Root directory `backend`, Dockerfile. Env: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `FRONTEND_ORIGIN`.
- **Frontend:** Deploy to [Vercel](https://vercel.com). Root Directory `frontend`. Env: `VITE_API_URL` = Railway backend URL.

## Publishing this repo to GitHub

1. Create a **private** repository on GitHub (e.g. [ViperClaw1/mood-journal](https://github.com/ViperClaw1)); do not add a README or .gitignore when creating it.
2. From the repo root:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Mood Journal app with Docker backend"
   git remote add origin https://github.com/ViperClaw1/mood-journal.git
   git branch -M main
   git push -u origin main
   ```

   Replace `ViperClaw1/mood-journal` with your actual repo URL if different.
