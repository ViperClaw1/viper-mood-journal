# Mood Journal — Architecture & Technical Documentation

This document describes the architecture, implementation, and run instructions for the Mood Journal application. It is intended for developers who need to understand, run, maintain, or extend the project.

---

## 1. Project Overview

### What the application does

Mood Journal is a web application where users write a short mood or reflection and receive a supportive text response from Claude (Anthropic). Entries and AI responses are stored and displayed in a history list.

### Primary use case

- User opens the app in a browser.
- User types a mood/thought (e.g. “Tired and depressed”) and submits.
- Backend sends the text to the Anthropic Messages API (Claude), then saves the user text and the AI response (or a failure reason) to PostgreSQL.
- User sees the latest reflection and a chronological history of past entries.

### Main technologies

| Layer      | Technology |
|-----------|------------|
| Frontend  | Vanilla JS (ES modules), Vite 6, CSS |
| Backend   | Node.js (ES modules), Express 5 |
| Database  | PostgreSQL, Prisma 7 (with `@prisma/adapter-pg`) |
| AI        | Anthropic Messages API (direct `fetch` to `https://api.anthropic.com/v1/messages`) |
| Local run | Docker Compose (Postgres + backend), frontend on host via Vite |

---

## 2. Architecture Overview

### Overall structure

```
┌─────────────────┐     HTTP (JSON)      ┌─────────────────┐     SQL      ┌──────────────┐
│  Browser        │ ◄──────────────────► │  Express        │ ◄──────────► │  PostgreSQL  │
│  (Vite dev SPA) │   /entries, /health  │  (Node backend) │   Prisma     │  (Docker)    │
└─────────────────┘                      └────────┬────────┘              └──────────────┘
                                                   │
                                                   │ HTTPS (JSON)
                                                   ▼
                                          ┌─────────────────┐
                                          │  Anthropic      │
                                          │  /v1/messages   │
                                          └─────────────────┘
```

- **Frontend**: Single HTML page; JS drives form, API calls, and DOM updates. No framework.
- **Backend**: One Express app. Serves REST endpoints, calls Anthropic, and uses Prisma to read/write the database.
- **Database**: Single `JournalEntry` table.
- **Claude integration**: Implemented in the backend only, in `backend/lib/ai.js`, via direct `fetch()` to the Anthropic API (no SDK used for the message call).

### Request/response lifecycle (submit entry)

1. User submits the form → frontend `createEntry(mood)` → `POST ${API_BASE}/entries` with body `{ mood: "..." }`.
2. Backend receives `POST /entries`, validates `mood`, calls `getJournalingResponse(mood)`.
3. `getJournalingResponse` (in `lib/ai.js`) calls Anthropic; returns `{ text, errorCode? }`.
4. Backend creates a row via `prisma.journalEntry.create({ mood, aiResponse: text ?? undefined })`, then responds with the created entry (and optional `aiError` when Claude failed).
5. Frontend updates in-memory state, re-renders “Latest reflection” and history, and shows an error message if `entry.aiError` is set.

---

## 3. Project Structure

```
mood-journal/
├── backend/
│   ├── index.js              # Express app entry, CORS, routes mount, global error handler
│   ├── package.json          # type: "module", start script runs migrate + node
│   ├── prisma.config.ts      # Prisma 7 config (schema path, migrations, datasource url)
│   ├── Dockerfile            # Node 24 Alpine, prisma generate, CMD npm start
│   ├── .env.example          # ANTHROPIC_API_KEY, DATABASE_URL, PORT, FRONTEND_ORIGIN
│   ├── .dockerignore
│   ├── routes/
│   │   └── entries.js        # GET /entries, POST /entries (validation, Prisma, AI)
│   ├── lib/
│   │   ├── db.js             # Prisma client with PrismaPg adapter (DATABASE_URL)
│   │   └── ai.js             # getJournalingResponse(mood) → Anthropic API, returns { text, errorCode? }
│   └── prisma/
│       ├── schema.prisma     # Single model JournalEntry
│       └── migrations/       # One initial migration
├── frontend/
│   ├── index.html            # Single page, #app, form, #ai-response, #history-list
│   ├── package.json          # Vite 6, no deps
│   ├── vite.config.js        # port 5173, proxy /api → localhost:3000 (path rewritten to /)
│   └── src/
│       ├── main.js           # Bootstrap, event listeners, loadInitialHistory, handleSubmit
│       ├── api.js            # getApiBase(), getEntries(), createEntry(), parseErrorResponse
│       ├── state.js          # In-memory state: entries, loading, error, currentResponse
│       ├── ui.js             # DOM refs, setLoading, showError, renderCurrentResponse, renderHistory
│       └── style.css         # Styles for layout and components
├── docker-compose.yml        # postgres (5434:5432), backend (3000:3000), env_file backend/.env
└── docs/
    ├── ARCHITECTURE.md       # This file
    └── API.md               # Endpoint reference
```

### Responsibilities of major modules

| Module | Responsibility |
|--------|----------------|
| `backend/index.js` | Create Express app, CORS from `FRONTEND_ORIGIN`, `express.json()`, mount routes, 4-arg error handler, listen on `PORT`. |
| `backend/routes/entries.js` | GET/POST/DELETE entries scoped to `req.user.id` (requires `requireAuth` on mount). |
| `backend/routes/users.js` | Protected `GET`/`PUT` `/users/me`, `PUT` `/users/me/password`. |
| `backend/lib/userPublic.js` | `toPublicUser()` — safe user JSON for API responses. |
| `backend/middleware/authMiddleware.js` | `requireAuth` — JWT from cookie or `Authorization: Bearer`. |
| `backend/lib/db.js` | Build Prisma client with `PrismaPg` and `DATABASE_URL`; throw if `DATABASE_URL` missing. |
| `backend/lib/ai.js` | Call Anthropic `/v1/messages` with system prompt and user message; parse `content` blocks; return `{ text }` or `{ text: null, errorCode }`. |
| `frontend/src/main.js` | Bootstrap, wire form/textarea, load initial history, handle submit, handle delete entry, map `aiError` to user message. |
| `frontend/src/api.js` | Resolve `API_BASE`, `getEntries` / `createEntry` / `deleteEntry` with `credentials: 'include'` for cookie auth. |
| `frontend/src/state.js` | Central in-memory state for entries, loading, error, currentResponse; getters/setters. |
| `frontend/src/ui.js` | DOM queries, show/hide loading and error, render “Latest reflection” and history list. |

---

## 4. Backend Documentation

### Server entry point

- **File:** `backend/index.js`
- **Run:** `node index.js` (or `npm start`, which runs `npx prisma migrate deploy && node index.js`).
- Loads `dotenv/config` first, then creates the Express app, applies CORS and `express.json()`, registers routes, then the global error handler, then `app.listen(PORT)`.

### Express app structure

1. CORS middleware (origin allowlist or reflect `Origin` when open; methods GET/POST/DELETE/OPTIONS; headers Content-Type, Accept, Authorization).
2. `cookie-parser`, `express.json()`, Passport initialize; auth routes; `app.use("/users", createUsersRouter())`.
3. `GET /entries/ai-status` (public); `app.use("/entries", requireAuth, entriesRouter)` for user-scoped journal CRUD.
4. Global error handler: `(err, req, res, next) => res.status(err.statusCode ?? 500).json({ error: message })`.

There are no separate “controllers” or “services” in the codebase; route handlers and `lib/ai.js` + `lib/db.js` fulfill those roles.

### Route organization

- **`backend/routes/users.js`** — `createUsersRouter()` with `requireAuth` on all routes; mounted at `/users`.
- **`backend/routes/entries.js`** — mounted at `/entries` **after** `requireAuth`, so:
  - `GET /entries` → list **current user’s** entries
  - `POST /entries` → create entry (with AI) for **current user**
  - `DELETE /entries/:id` → delete if owned by current user
- **`GET /entries/ai-status`** is defined on the main app in `index.js` (not on the protected router), so it stays public and does not conflict with `GET /entries`.

### Prisma / database access

- **Client:** Created in `backend/lib/db.js` using `@prisma/adapter-pg` and `DATABASE_URL`. Required at import time; process exits if `DATABASE_URL` is missing.
- **Usage:** Only in `routes/entries.js`: `prisma.journalEntry.findMany({ orderBy: { createdAt: "desc" } })` and `prisma.journalEntry.create({ data: { mood, aiResponse } })`.
- No transactions or other Prisma features are used in the current code.

### Request validation

- **POST /entries:** Only validation is in the route: `req.body?.mood` must be a non-empty string. If not, the handler calls `next(err)` with `err.statusCode = 400`. No dedicated validation library.

### AI request flow

1. Route receives `mood`, trims it, calls `getJournalingResponse(mood.trim())`.
2. `lib/ai.js`:
   - If `ANTHROPIC_API_KEY` is missing or empty → return `{ text: null, errorCode: "key_missing" }`.
   - Else `fetch("https://api.anthropic.com/v1/messages", { method: "POST", body: { model, max_tokens, system, messages }, headers: x-api-key, anthropic-version })` with a 60s `AbortController` timeout.
   - If `!res.ok` → return `{ text: null, errorCode: "http_error" }`.
   - Parse JSON; if parsing fails → `http_error`.
   - Read `data.content` (array of blocks); extract text from each block’s `text`, `thinking`, or `content` (string). Concatenate; if empty → return `{ text: null, errorCode: "empty_response" }`.
   - On network/timeout/other throw → return `{ text: null, errorCode: "network_error" }`.
3. Route creates the DB entry with `aiResponse: aiText ?? undefined` and, when `aiErrorCode` is set, adds `aiError: aiErrorCode` to the JSON response (not stored in DB).

### Error handling strategy

- Route handlers use `try/catch` and `next(err)` for errors.
- Global handler sends `{ error: message }` and status `err.statusCode ?? 500`.
- AI layer never throws; it returns `{ text, errorCode? }`. Only uncaught errors (e.g. Prisma or Express) reach the global handler.

### Environment variables used by the backend

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string; used by Prisma and by `lib/db.js`. |
| `ANTHROPIC_API_KEY` | Yes for AI | Used in `lib/ai.js` for the Anthropic API. If missing, entries are still created with `aiResponse: null` and `aiError: "key_missing"`. |
| `PORT` | No (default 3000) | Port the Express server listens on. |
| `FRONTEND_ORIGIN` | No (default `*`) | Allowed CORS origin(s), comma-separated; no trailing slash. If unset, request `Origin` is echoed for credentialed requests. |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | No | Resend SMTP + sender for password reset (`lib/mail.js`). If unset, forgot-password returns 200 but sends no mail. |
| `PASSWORD_RESET_FRONTEND_URL` | No | Reset link base in emails; falls back to `FRONTEND_ORIGIN` + `/reset-password`. |

---

## 5. API Documentation

See **docs/API.md** for a concise endpoint reference. Summary:

| Method | Route | Purpose |
|--------|--------|--------|
| GET | `/` | Liveness; returns `{ ok: true, message: "Mood journal API" }`. |
| GET | `/health` | Health check; returns `{ status: "ok" }`. |
| GET | `/entries` | **Auth required.** List current user’s journal entries (newest first). |
| POST | `/entries` | **Auth required.** Create one entry for current user. Body: `{ mood: string }`. |
| DELETE | `/entries/:id` | **Auth required.** Delete own entry; 404 if missing or not owned. |
| GET | `/entries/ai-status` | Public. Check if `ANTHROPIC_API_KEY` is set. |
| GET/PUT | `/users/me` | **Auth required.** Read or update profile (`name`, `avatarUrl`). |
| PUT | `/users/me/password` | **Auth required.** Change password (`currentPassword`, `newPassword`). |
| GET | `/auth/me` | **Auth required.** Same as `GET /users/me` (legacy). |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Registration, session cookie, logout. |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Email reset flow (see **docs/API.md**). |

---

## 6. Database Documentation

### Prisma schema

- **File:** `backend/prisma/schema.prisma`
- **Datasource:** `postgresql`; URL comes from `prisma.config.ts` → `env("DATABASE_URL")`.
- **Generator:** `prisma-client-js`, output `../node_modules/.prisma/client`.

### Models and relationships

- **`User`** — auth profile (`email`, `passwordHash`, optional `avatarUrl`, `theme`, optional password-reset fields).
- **`JournalEntry`** — `mood`, `aiResponse`, optional **`userId`** FK to `User` (API scopes entries per user).

See `backend/prisma/schema.prisma` for the full schema.

### How entries are stored

- Each authenticated POST creates one `JournalEntry` with `userId` set to the current user.
- `mood` is the user-supplied string (trimmed).
- `aiResponse` is the Claude reply text, or `null` if the API key was missing, the API failed, or the response had no extractable text.
- `aiError` is **not** stored; it is only added to the HTTP response when the AI layer returns an `errorCode`.
- Legacy rows with `userId: null` are not returned by `GET /entries` for any user.

### Important fields

| Field | Type | Notes |
|-------|------|--------|
| `id` | String (cuid) | Primary key, generated by Prisma. |
| `userId` | String? | Owner; set on new entries via API. |
| `mood` | String | Required; user’s input. |
| `aiResponse` | String? | Claude’s reply or null. |
| `createdAt` | DateTime | Set by DB default. |

### Migration workflow

- Migrations live in `backend/prisma/migrations/`. Initial migration: `20260311175437_init/migration.sql` (creates `JournalEntry` table).
- **Apply:** `npx prisma migrate deploy` (used in production and in `npm start`). For local Docker: `docker compose exec backend npx prisma migrate deploy`.
- **Generate client only:** `npx prisma generate` (run in Dockerfile at build time; requires a placeholder `DATABASE_URL` for Prisma 7).

---

## 7. Frontend Documentation

### Entry point

- **HTML:** `frontend/index.html` loads `<script type="module" src="/src/main.js"></script>`.
- **JS:** `frontend/src/main.js` imports `style.css`, hydrates session via `GET /auth/session`, creates **Navigo** router (`router.js`), renders nav, resolves the current URL.

### HTML / CSS / JS structure

- **Client-side routes** (History API, no full reload): `/` journal, `/login`, `/signup`, `/settings`, `/forgot-password`, `/reset-password?token=`. Protected routes redirect to `/login` without a JWT in memory.
- **Outlet:** `#app-outlet` is cleared and repopulated per route; journal markup is built in `pages/journalPage.js`. `ui.js` uses `setUiScope(outlet)` so queries stay inside the active page.
- **Auth:** In-memory `accessToken` from login/register/refresh responses; `api.js` sends `Authorization: Bearer` plus `credentials: 'include'` for cookies.
- **CSS:** `frontend/src/style.css`; no CSS framework or CSS modules.
- **JS:** ES modules only; no bundling framework other than Vite (which bundles for dev and build).

### UI components / DOM sections

| Element / section | Purpose |
|-------------------|--------|
| `#journal-form`, `#journal-input`, `#submit-btn` | Form and textarea for mood; submit button. |
| `#loading` | “Claude is thinking...” (hidden by default; shown during submit). |
| `#error` | Error banner (hidden when no error). |
| `#ai-response-section`, `#ai-response` | “Latest reflection” area; placeholder or AI text (or error message when `aiError`). |
| `#history`, `#history-list` | History section; list of entry cards (or empty state). |

### Form submission flow

1. User submits form (button or Ctrl/Cmd+Enter).
2. `handleSubmit(textarea)` runs: validates non-empty trimmed text, sets loading, clears error.
3. `createEntry(trimmed)` → `POST ${API_BASE}/entries` with `{ mood: trimmed }` and `credentials: 'include'` (requires logged-in cookie for journal API).
4. On success: response is the created entry (with optional `aiError`). State is updated: `prependEntry(entry)`, then either set `currentResponse` and error from `entry.aiError` message or set `currentResponse` to `entry.aiResponse` and clear error. Then `renderCurrentResponse`, `renderHistory`, clear textarea.
5. On failure: catch block sets error state and calls `showError(getError())`.
6. `setClaudeLoading(false)` in `finally`.

### Fetch requests to the backend

- **Module:** `frontend/src/api.js`.
- **Base URL:** `getApiBase()`: (1) `import.meta.env.VITE_API_URL` if set (trimmed trailing slash), (2) if `window.location.origin === "https://viper-mood-journal.vercel.app"` then hardcoded production backend URL, (3) else `"/api"` (proxied by Vite to `http://localhost:3000` with path rewritten so `/api/entries` → `http://localhost:3000/entries`).
- **Session:** `fetchSession` → `GET /auth/session` (cookie) for full-page reload / OAuth return.
- **Auth helpers:** `loginRequest`, `registerRequest`, `logoutRequest`, `forgotPasswordRequest`, `resetPasswordRequest`, `getMeRequest`, `updateMeRequest`, `updatePasswordRequest`.
- **getEntries / createEntry / deleteEntry:** same as before, with `Authorization: Bearer` when `accessToken` is set (see `authHeaders()` in `api.js`).

### Loading state handling

- `state.loading` and the visible `#loading` indicator and disabled submit button are set together via `setClaudeLoading(isLoading)` in `main.js`.
- Loading is set true at the start of `loadInitialHistory` and of `handleSubmit`, and false in their `finally` blocks.

### Response rendering

- **Latest reflection:** `renderCurrentResponse(getCurrentResponse())` writes to `#ai-response`. If content is empty, a placeholder and `response-empty` class are used; otherwise the text is shown.
- **After submit:** If `entry.aiError` is set, the “current response” and error banner show the human-readable message from `aiErrorToMessage(entry.aiError)`.

### History rendering

- `renderHistory(getEntries(), onDeleteEntry)` clears `#history-list` and, for each entry, creates an article with date, “Journal” tag, optional delete (trash) button when `onDeleteEntry` is provided, “You” (mood), “Claude” (aiResponse or “No response recorded.”). No pagination; all entries in memory are rendered.

### Error handling in the UI

- API errors (network or 4xx/5xx) are turned into an `Error` with a message and optional `.status`; `createEntry` or `apiGetEntries` throw.
- Catch blocks in `loadInitialHistory` and `handleSubmit` set `setError(...)` and `showError(getError())`.
- When the backend returns success but `entry.aiError`, the frontend shows the corresponding message in both the reflection area and the error banner.

---

## 8. Data Flow

### 1. User opens the app

- Browser loads `index.html` and `main.js`. `bootstrap()` runs: gets form elements, attaches submit and keydown listeners, calls `autoResizeTextarea()`, then `await loadInitialHistory()`.

### 2. Load history

- `loadInitialHistory()` sets loading true, clears error, calls `apiGetEntries()` → `GET /entries` (or proxied `/api/entries`). Backend returns JSON array of entries (newest first). Frontend calls `setEntries(entries)`, `renderHistory(getEntries())`. If the first entry has `aiResponse`, it sets `currentResponse` and calls `renderCurrentResponse`. Loading is set false in `finally`.

### 3. User submits a journal entry

- Form submit → `handleSubmit`. Trims textarea value; if empty, shows error and returns. Sets loading, clears error, calls `createEntry(trimmed)` → `POST /entries` with `{ mood }`.

### 4. Backend and Claude

- Backend validates `mood`, calls `getJournalingResponse(mood)`. If API key is set, it calls Anthropic; then it creates a `JournalEntry` with `mood` and `aiResponse` (or null) and returns the entry object, optionally with `aiError`.

### 5. Frontend after response

- Frontend receives the created entry. It prepends it to state, then either displays the `aiError` message (reflection area + error banner) or the `aiResponse` as the latest reflection and clears error. It re-renders the reflection and history, clears the textarea, and sets loading false. On throw (network or API error), it shows the error message and sets loading false.

### 6. User deletes an entry

- User clicks the trash icon on an entry card → `handleDeleteEntry(id)` runs. Frontend calls `DELETE /entries/:id`. On success: `removeEntryById(id)`; if the deleted entry was the one shown as “Latest reflection” (first in list), current reflection is set to the new first entry’s `aiResponse` or empty; then `renderCurrentResponse` and `renderHistory(entries, onDeleteEntry)` re-render the UI. On failure, error state is set and `showError` displays the message.

---

## 9. Environment Variables

### Backend (backend/.env or Railway)

| Variable | Required | Example (no real secrets) | Notes |
|----------|----------|---------------------------|--------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@postgres:5432/mood_journal` | Docker: host `postgres`, port 5432. Local host run would use localhost and appropriate port. |
| `ANTHROPIC_API_KEY` | Yes for AI | (from Anthropic Console) | Omit or leave empty: entries still created, `aiResponse` null, `aiError: "key_missing"`. |
| `PORT` | No | `3000` | Default 3000. |
| `FRONTEND_ORIGIN` | No | `https://viper-mood-journal.vercel.app` | Comma-separated list allowed; no trailing slash. Default `*`. |

### Frontend (build-time)

| Variable | Required | Example | Notes |
|----------|----------|---------|--------|
| `VITE_API_URL` | No (for production) | `https://your-backend.up.railway.app` | No trailing slash. Used when building for production so the client calls the real backend. If unset in production, the app uses a hardcoded fallback when origin is `https://viper-mood-journal.vercel.app`. |

### Example .env (backend)

See `backend/.env.example`. Do not commit `.env`. Example content (no real secrets):

```env
ANTHROPIC_API_KEY=your-anthropic-api-key-from-console-anthropic
DATABASE_URL="postgresql://postgres:postgres@postgres:5434/mood_journal"
PORT=3000
# FRONTEND_ORIGIN=
```

---

## 10. Local Development

### Prerequisites

- Docker and Docker Compose (for Postgres and backend).
- Node.js and npm (for frontend and, if running backend locally, for backend).

### Install dependencies

- **Backend:** Inside `backend/`: `npm ci` (or `npm install`). For Docker, the image runs `npm ci` in the Dockerfile.
- **Frontend:** Inside `frontend/`: `npm install`.

### Run database

- From repo root: `docker compose up -d postgres` (or run the full stack). Postgres listens on `localhost:5434` (mapped from 5432).

### Run backend

- **Option A (Docker):** `docker compose up backend` (after Postgres is healthy). Backend uses `backend/.env` and `DATABASE_URL` from compose. Migrations run on `npm start`.
- **Option B (host):** In `backend/`, create `.env` with `DATABASE_URL` pointing to your Postgres (e.g. `localhost:5434` if using Docker Postgres). Run `npx prisma migrate deploy`, then `npm run dev` (or `node --watch index.js`). Backend listens on port 3000 by default.

### Run frontend

- In `frontend/`: `npm run dev`. Vite serves the app (default port 5173) and proxies `/api` to `http://localhost:3000` with path rewrite so `/api/entries` → `http://localhost:3000/entries`.

### Prisma commands (backend)

- From `backend/` (or inside backend container):  
  - `npx prisma migrate deploy` — apply migrations.  
  - `npx prisma generate` — regenerate client (e.g. after schema change).  
- Migrations are under `backend/prisma/migrations/`. Schema is `backend/prisma/schema.prisma`; datasource URL is from `prisma.config.ts` and `DATABASE_URL`.

---

## 11. Docker

### What each container does

- **postgres:** Official `postgres:16-alpine`. Database for the app. Exposes 5432 inside the network; host port 5434. Persistent volume `postgres_data`. Health check: `pg_isready -U postgres`.
- **backend:** Built from `backend/Dockerfile`. Node 24 Alpine; installs deps, runs `prisma generate` (build-time), then at runtime `npm start` (migrate + `node index.js`). Listens on 3000. Depends on Postgres being healthy. Uses `backend/.env` via `env_file`; compose also sets `PORT` and `DATABASE_URL` (overriding `.env` for `DATABASE_URL` so the backend talks to the `postgres` service on port 5432).

### How services communicate

- Backend connects to Postgres using hostname `postgres` and port 5432 (internal network). The host uses `localhost:5434` only if connecting from the host (e.g. a local Prisma run).

### How to start the stack

From repo root:

```bash
docker compose up --build
```

Optional: run migrations explicitly (they also run on backend start):

```bash
docker compose exec backend npx prisma migrate deploy
```

### Notes

- Backend Dockerfile uses a build-time `ENV DATABASE_URL=...` for `prisma generate`; runtime `DATABASE_URL` comes from compose (or `.env`).
- Frontend is not in Docker; it runs on the host with `npm run dev` and uses the proxy to reach the backend.

---

## 12. Error Handling and Edge Cases

### Known failure points

- **Missing `ANTHROPIC_API_KEY`:** Entries are created with `aiResponse: null`; response includes `aiError: "key_missing"`; frontend shows the “API key is not set” message.
- **Anthropic API 4xx/5xx or invalid JSON:** `aiResponse` null, `aiError: "http_error"`; entry is still saved.
- **Network/timeout calling Anthropic:** `aiError: "network_error"`; entry saved with null `aiResponse`.
- **Empty content from Claude:** `aiError: "empty_response"`; entry saved with null `aiResponse`.
- **Missing or invalid `DATABASE_URL`:** `lib/db.js` throws on load; server does not start.
- **Prisma/DB errors during request:** Propagate to Express global handler; client gets 500 and `{ error: "Internal server error" }`.

### API / network / database

- Frontend treats non-OK fetch as error and parses JSON error body when possible; throws with a message. Network errors (no response) throw “Network error – could not reach the server.”
- Backend does not retry Anthropic or DB calls. One attempt per request.

### Frontend loading and error states

- Loading: submit button disabled and “Claude is thinking...” shown during both initial history load and submit. (Initial load is a GET; “Claude is thinking...” is a single flag used for both for simplicity.)
- Errors: shown in `#error` and, when `aiError` is present, also in the reflection area. No distinction between “loading failed” and “submit failed” in the UI beyond the message.

### Validation

- **POST /entries:** Only checks that `mood` is a non-empty string after trim. No max length or sanitization. Invalid body yields 400 and `{ error: "mood is required and must be a non-empty string" }` (or similar).

---

## 13. Known Limitations / Future Improvements

- **No auth:** Anyone with the URL can create and read entries. No user accounts or multi-tenancy.
- **No pagination:** GET /entries returns all entries; history list renders all. May not scale to large datasets.
- **Single journal:** No tags, titles, or separate “journals”; one flat list of entries.
- **AI model fixed:** Model ID is hardcoded in `lib/ai.js` (`claude-sonnet-4-5-20250929`). Changing it requires a code change.
- **No rate limiting:** Backend does not limit requests per IP or per client.
- **Error messages:** Some backend messages are generic (“Internal server error”); logging is used for debugging. Frontend could surface more specific messages for known error shapes.
- **History order:** Entries are returned newest-first; there is no “oldest first” or date filter.
- **No tests:** No unit or integration tests in the repository.
- **Hardcoded production URL:** Frontend `api.js` has a fallback for `https://viper-mood-journal.vercel.app` to a specific Railway URL; another deployment would need that fallback updated or `VITE_API_URL` set.

---

## 14. Suggested Documentation Improvements in the Codebase

- **README:** Already covers run, Docker, and production. Could add a one-line link to `docs/ARCHITECTURE.md` and `docs/API.md` for technical details.
- **Env example:** `backend/.env.example` is present and clear; frontend has no `.env.example` (only `VITE_API_URL` is documented in README/this doc).
- **API schema:** No OpenAPI/Swagger file; `docs/API.md` serves as the contract. Adding a small JSON example for POST request/response would help.
- **Comments:** Route handlers and `lib/ai.js` have some JSDoc and inline comments; `lib/db.js` and `state.js` are minimal. Key functions could have one-line purpose comments.
- **Module boundaries:** `main.js` both orchestrates and knows about `aiError` messages; the mapping could live in `api.js` or a small `errors.js` for reuse.
- **Naming:** “Claude is thinking...” is shown during initial GET as well as POST; the label is slightly misleading. Consider “Loading…” for initial load and “Claude is thinking...” only during submit (or a single “Loading…” for both).
