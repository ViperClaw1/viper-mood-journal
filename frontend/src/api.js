import { getAccessToken, setSession } from "./authSession.js";

const PRODUCTION_API_URL = "https://viper-mood-journal-production.up.railway.app";

function getApiBase() {
  const env = import.meta.env.VITE_API_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.origin === "https://viper-mood-journal.vercel.app") {
    return PRODUCTION_API_URL;
  }
  return "/api";
}

export const API_BASE = getApiBase();

/** Full navigation URL to start Google OAuth (same origin /api or absolute backend URL). */
export function getGoogleAuthUrl() {
  const base = API_BASE.startsWith("http") ? API_BASE : `${window.location.origin}${API_BASE}`;
  return `${base}/auth/google`;
}

function authHeaders(extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseErrorResponse(response) {
  let message = response.statusText || "Request failed";

  try {
    const data = await response.json();
    if (data && typeof data.error === "string" && data.error.trim()) {
      message = data.error.trim();
    }
  } catch {
    // ignore
  }

  const error = new Error(message);
  error.status = response.status;
  return error;
}

/** Hydrate SPA from HttpOnly cookie (returns accessToken + user). */
export async function fetchSession() {
  return fetch(`${API_BASE}/auth/session`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
}

/**
 * Router guards use in-memory JWT (Bearer); HttpOnly cookie is invisible to JS.
 * After login/register, prefer body.accessToken; if missing or parse failed, GET /auth/session
 * reads the cookie server-side and returns the same token + user.
 */
export async function syncSessionAfterAuth(responseBody) {
  const body = responseBody && typeof responseBody === "object" ? responseBody : {};
  const fromBody =
    typeof body.accessToken === "string" && body.accessToken.trim() ? body.accessToken.trim() : null;
  const hasUserPayload = Boolean(body.user && typeof body.user === "object");
  if (fromBody) {
    setSession(fromBody, hasUserPayload ? body.user : null);
    if (hasUserPayload) return;
  }
  const res = await fetchSession();
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  const token =
    typeof data.accessToken === "string" && data.accessToken.trim() ? data.accessToken.trim() : null;
  if (token) {
    setSession(token, data.user ?? null);
  }
}

export async function loginRequest(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function registerRequest(name, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function logoutRequest() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
  });
}

export async function forgotPasswordRequest(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function resetPasswordRequest(token, password) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function getMeRequest() {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: "GET",
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return res.json();
}

export async function updateMeRequest(body) {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: "PUT",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return res.json();
}

/** Multipart upload; field name must be `avatar`. Updates user.avatarUrl on the server. */
export async function uploadAvatarRequest(file) {
  const fd = new FormData();
  fd.append("avatar", file);
  const res = await fetch(`${API_BASE}/users/me/avatar`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return res.json();
}

export async function updatePasswordRequest(currentPassword, newPassword) {
  const res = await fetch(`${API_BASE}/users/me/password`, {
    method: "PUT",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return res.json();
}

export async function getEntries() {
  const res = await fetch(`${API_BASE}/entries`, {
    method: "GET",
    credentials: "include",
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

export async function createEntry(userTextRaw) {
  const mood = userTextRaw?.trim() ?? "";

  if (!mood) {
    throw new Error("Please write something before submitting.");
  }

  let res;

  try {
    // eslint-disable-next-line no-console
    console.debug("[api] POST /entries payload", { mood });
    res = await fetch(`${API_BASE}/entries`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ mood }),
    });
  } catch (networkError) {
    // eslint-disable-next-line no-console
    console.error("[api] Network error POST /entries", networkError);
    throw new Error("Network error – could not reach the server.");
  }

  if (!res.ok) {
    const error = await parseErrorResponse(res);
    // eslint-disable-next-line no-console
    console.warn("[api] POST /entries non-OK", {
      status: res.status,
      statusText: res.statusText,
      message: error.message,
    });
    throw error;
  }

  const data = await res.json();

  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.mood !== "string" ||
    typeof data.createdAt !== "string"
  ) {
    // eslint-disable-next-line no-console
    console.error("[api] POST /entries unexpected shape", data);
    throw new Error("Unexpected response from server.");
  }

  // eslint-disable-next-line no-console
  console.debug("[api] POST /entries success", data);
  return data;
}

export async function deleteEntry(id) {
  if (!id || typeof id !== "string") {
    throw new Error("Entry id is required.");
  }
  const res = await fetch(`${API_BASE}/entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
}
