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

### GET /entries

**Purpose:** List all journal entries, newest first.

**Response:** `200 OK`

Body: array of `JournalEntry` objects:

```json
[
  {
    "id": "cuid-string",
    "mood": "User's mood text",
    "aiResponse": "Claude's response or null",
    "createdAt": "2026-03-14T12:00:00.000Z"
  }
]
```

**Errors:**

- `500` — Database or server error; body `{ "error": "Internal server error" }` (or another message).

---

### POST /entries

**Purpose:** Create a new journal entry. Backend sends the mood to Claude (Anthropic API), then stores the entry and returns it. If Claude is not available or fails, the entry is still created with `aiResponse: null` and an `aiError` code in the response.

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
- `500` — Unhandled server error (e.g. database). Body: `{ "error": "Internal server error" }` (or another message).

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

## CORS

The backend allows origins from the `FRONTEND_ORIGIN` environment variable (comma-separated, no trailing slash). If unset, all origins are allowed (`*`). Allowed methods: GET, POST, OPTIONS. Allowed headers: Content-Type, Accept.

---

## Local development and proxy

When running the frontend with Vite dev server, requests to `/api` are proxied to the backend:

- Frontend calls `GET /api/entries` or `POST /api/entries`.
- Vite proxies to `http://localhost:3000` and rewrites the path: `/api/entries` → `/entries`.
- So the backend sees `GET /entries` and `POST /entries`.
