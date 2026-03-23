# Mood Journal — API Reference

Base URL: backend root (e.g. `http://localhost:3000` locally, or your Railway backend URL in production).  
All responses are JSON. The frontend uses `Accept: application/json` and, for POST, `Content-Type: application/json`.

---

## Endpoints

### GET /

**Purpose:** Simple liveness check.

**Response:** `200 OK`

```json
{ "ok": true, "message": "Mood journal API" }
```

---

### GET /health

**Purpose:** Health check (e.g. for load balancers or monitoring).

**Response:** `200 OK`

```json
{ "status": "ok" }
```

---

### Journal entries — owner isolation

`GET /entries`, `POST /entries`, and `DELETE /entries/:id` all require authentication. The server resolves the user from the JWT (HttpOnly cookie `auth_token` and/or `Authorization: Bearer`). **Only that user’s rows** are listed, created, or deleted. Another user cannot read or delete a peer’s entry by id (delete returns `404`).

`GET /entries/ai-status` is unauthenticated and only reports whether an Anthropic key is configured.

**Manual QA:** Use two browsers or normal + incognito: register/login as different users, create entries as each, and confirm each session’s `GET /entries` (or the journal History UI) only shows that user’s rows. In DevTools → Network, entry requests should send `Authorization: Bearer …` when the SPA has a token, and `Cookie` when using credentialed same-site auth.

---

### GET /entries

**Purpose:** List the **authenticated user’s** journal entries, newest first.

**Authentication:** Required — HttpOnly cookie `auth_token` and/or `Authorization: Bearer <jwt>`.

**Response:** `200 OK`

Body: array of `JournalEntry` objects (includes `userId` when present):

```json
[
  {
    "id": "cuid-string",
    "mood": "User's mood text",
    "aiResponse": "Claude's response or null",
    "userId": "user-cuid",
    "createdAt": "2026-03-14T12:00:00.000Z"
  }
]
```

**Errors:**

- `401` — Not logged in.
- `500` — Database or server error; body `{ "error": "Internal server error" }` (or another message).

---

### POST /entries

**Purpose:** Create a new journal entry **for the authenticated user**. Backend sends the mood to Claude (Anthropic API), then stores the entry and returns it. If Claude is not available or fails, the entry is still created with `aiResponse: null` and an `aiError` code in the response.

**Authentication:** Required (cookie or Bearer).

**Request:**

- **Method:** POST  
- **Headers:** `Content-Type: application/json`, `Accept: application/json`  
- **Body:**

```json
{ "mood": "User's mood or reflection text" }
```

- **Validation:** `mood` must be a non-empty string (after trim). Otherwise the backend responds with `400`.

**Response:** `201 Created`

Body: created `JournalEntry` plus optional `aiError`:

```json
{
  "id": "cuid-string",
  "mood": "User's mood text",
  "aiResponse": "Claude's reply or null",
  "createdAt": "2026-03-14T12:00:00.000Z",
  "aiError": "key_missing"
}
```

- `aiError` is only present when the AI layer could not produce a response. It is **not** stored in the database. Possible values:
  - `key_missing` — `ANTHROPIC_API_KEY` not set on the server
  - `http_error` — Anthropic API returned an error or invalid JSON
  - `empty_response` — API succeeded but no text in response content
  - `network_error` — Network failure or timeout calling Anthropic

**Errors:**

- `400` — Invalid body (e.g. missing or empty `mood`). Body: `{ "error": "mood is required and must be a non-empty string" }` (or similar).
- `401` — Not logged in.
- `500` — Unhandled server error (e.g. database). Body: `{ "error": "Internal server error" }` (or another message).

---

### DELETE /entries/:id

**Purpose:** Delete a journal entry by id **only if it belongs to the authenticated user**.

**Authentication:** Required (cookie or Bearer).

**Request:**

- **Method:** DELETE  
- **Path param:** `id` — the entry’s cuid. If missing or empty, the backend responds with 400.

**Response:** `204 No Content` (no body).

**Errors:**

- `400` — Missing or empty `id`. Body: `{ "error": "..." }`.
- `401` — Not logged in.
- `404` — Entry not found or not owned by you. Body: `{ "error": "Entry not found" }`.
- `500` — Server error. Body: `{ "error": "..." }`.

---

### GET /entries/ai-status

**Purpose:** Check whether the backend has an Anthropic API key configured (value never exposed). Useful for debugging production without logging secrets.

**Response:** `200 OK`

```json
{ "ok": true, "hasApiKey": true }
```

or

```json
{ "ok": true, "hasApiKey": false }
```

---

## Authentication

Cookies: login/register may set an HttpOnly `auth_token` cookie. Send cookies with `credentials: 'include'` from the browser, or use `Authorization: Bearer <jwt>` if you copy the token.

Entries and `/users/*` require auth. **Thunder Client / Postman:** after `POST /auth/login`, copy the JWT from the `auth_token` cookie if exposed, or decode from browser devtools; add header `Authorization: Bearer <paste>` for subsequent requests.

### GET /users/me

**Authentication:** Required.

**Response:** `200` — `{ "user": { "id", "name", "email", "avatarUrl", "theme", "createdAt" } }`.

**Errors:** `401`, `404` if user row missing.

---

### POST /users/me/avatar

**Authentication:** Required.

**Body:** `multipart/form-data` with a single file field named **`avatar`**. Allowed: JPEG, PNG, WebP; max **2 MB**.

**Behavior:** Stores the file under `/uploads/avatars/` on the API server and sets `user.avatarUrl` to an absolute URL (use env **`PUBLIC_API_URL`** in production so the URL points at your API host, e.g. `https://api.example.com`; otherwise the request host is used).

**Response:** `200` — `{ "user": { ... } }`.

**Errors:** `400` (missing file, wrong type, too large), `401`, `404`.

---

### PUT /users/me

**Authentication:** Required.

**Body:** at least one of:

- `name` — non-empty string  
- `avatarUrl` — string: empty to clear, or `http`/`https` URL  
- `theme` — `"LIGHT"` or `"DARK"` (matches Prisma `Theme` enum; persisted and returned on `user.theme`)

**Response:** `200` — `{ "user": { ... } }` (public user includes `theme`).

**Errors:** `400` validation (e.g. invalid `theme`), `401`, `404`.

---

### PUT /users/me/password

**Authentication:** Required.

**Body:** `{ "currentPassword": string, "newPassword": string }` (`newPassword` min 8 characters).

**Response:** `200` — `{ "message": "Password updated" }`. Clears any active password-reset token.

**Errors:** `400`, `401` — `{ "error": "Current password is incorrect" }`, `404`.

**Note:** Accounts created via Google OAuth use a random internal password; use **forgot-password** email once to set a known password, then this endpoint works.

---

### GET /auth/me

Same profile as **GET /users/me** (legacy path). Prefer `/users/me` for new clients.

---

### GET /auth/session

**Purpose:** If a valid `auth_token` cookie is present, return the same user profile and JWT string so SPAs can hydrate in-memory `Authorization: Bearer` after refresh or OAuth redirect.

**Authentication:** None; uses cookie only.

**Response:** `200` — `{ "user": { ... }, "accessToken": "<jwt>" }`.

**Errors:** `401` — missing/invalid/expired cookie.

---

### POST /auth/register

**Body:** `{ "name": string, "email": string, "password": string }` (password min 8 chars).

**Response:** `201` — `{ "user": { ... }, "accessToken": "<jwt>" }` (same token as HttpOnly `auth_token` cookie).

**Errors:** `400` validation, `409` email already registered.

---

### POST /auth/login

**Body:** `{ "email": string, "password": string }`.

**Response:** `200` — `{ "user": { ... }, "accessToken": "<jwt>" }`.

**Errors:** `401` invalid credentials.

---

### POST /auth/logout

**Response:** `204` — clears auth cookie.

---

### GET /auth/google

**Purpose:** Start Google OAuth (browser navigation). Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Response:** Redirect to Google consent screen.

---

### GET /auth/google/callback

**Purpose:** Passport completes sign-in, sets HttpOnly `auth_token` cookie, then **302** redirects the browser to the frontend root (`FRONTEND_ORIGIN`, first comma-separated entry, default `http://localhost:5173`) with:

`/?accessToken=<jwt>` (URL-encoded JWT).

SPAs should read `accessToken` from the query string, persist it for `Authorization: Bearer`, remove the param from the address bar (`history.replaceState`), then optionally call **GET /auth/session** to hydrate `user`.

**Errors:** `500` if Google OAuth is not configured; `401` JSON if Google auth fails.

---

### POST /auth/forgot-password

**Purpose:** Start password reset. Always returns the same message whether the email exists (anti-enumeration). If the user exists and SMTP is configured (Resend), sends an email with a time-limited link.

**Body:** `{ "email": string }`.

**Response:** `200`

```json
{
  "message": "If an account exists for this email, you will receive reset instructions."
}
```

**Errors:** `400` — missing or empty `email`.

**Server env:** `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (Resend API key as password), and `PASSWORD_RESET_FRONTEND_URL` or `FRONTEND_ORIGIN` for the link in the email. If SMTP is not configured, the response is still `200` but no email is sent (check server logs).

---

### POST /auth/reset-password

**Purpose:** Complete reset with the token from the email link (query param `token`). Token is single-use and expires after 1 hour.

**Body:** `{ "token": string, "password": string }` (password min 8 characters).

**Response:** `200`

```json
{ "message": "Password updated" }
```

**Errors:** `400` — missing fields, weak password, invalid/expired/already-used token: `{ "error": "Invalid or expired reset link" }`.

---

### Testing password reset (Thunder Client or similar)

1. Set mail-related variables in `backend/.env` (see `.env.example`). Use a verified domain in Resend for `MAIL_FROM`.
2. `POST /auth/forgot-password` with JSON `{ "email": "<registered-user-email>" }` → expect `200` and the generic `message`.
3. Open the inbox for that address; copy the `token` value from the reset URL query string.
4. `POST /auth/reset-password` with `{ "token": "<paste>", "password": "newpass12" }` → expect `200`.
5. `POST /auth/login` with the new password → expect `200`.
6. Call `POST /auth/reset-password` again with the same token → expect `400` (single-use).

Calling `forgot-password` again issues a **new** token and invalidates using the old link after the DB update (previous token is overwritten).

---

### Testing protected routes (Thunder Client)

1. **Register or login:** `POST /auth/register` or `POST /auth/login` with JSON body.
2. **Bearer:** From the login response, read Set-Cookie `auth_token=...` (Thunder Client Cookies tab) **or** use a client that stores cookies automatically. Alternatively, paste the JWT into **Authorization** → Type **Bearer Token**.
3. **Profile:** `GET http://localhost:3000/users/me` with that auth → `200`.
4. **Update:** `PUT /users/me` body `{ "name": "New Name" }` → `200`.
5. **Password:** `PUT /users/me/password` body `{ "currentPassword": "...", "newPassword": "newpass12" }` → `200`.
6. **Entries:** `GET /entries` with same auth → `200` (empty array if none). `POST /entries` `{ "mood": "hello" }` → `201`.

---

## CORS

The backend uses `FRONTEND_ORIGIN` (comma-separated, no trailing slash). If unset, credentialed browser requests still work: the server **reflects the request `Origin`** header (instead of `*`) so `credentials: 'include'` and cookies are allowed. Allowed methods: GET, POST, DELETE, OPTIONS. Allowed headers: Content-Type, Accept, Authorization.

---

## Local development and proxy

When running the frontend with Vite dev server, requests to `/api` are proxied to the backend:

- Frontend calls `GET /api/entries` or `POST /api/entries`.
- Vite proxies to `http://localhost:3000` and rewrites the path: `/api/entries` → `/entries`.
- So the backend sees `GET /entries` and `POST /entries`.
- Use `credentials: 'include'` on entry fetches so the `auth_token` cookie is sent after login through the proxy.
