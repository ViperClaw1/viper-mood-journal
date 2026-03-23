import { applyThemeForUser } from "./theme.js";

let accessToken = null;
let cachedUser = null;

export function setSession(token, user) {
  accessToken = typeof token === "string" && token.trim() ? token.trim() : null;
  cachedUser = user ?? null;
  applyThemeForUser(cachedUser);
}

export function getAccessToken() {
  return accessToken;
}

export function getCachedUser() {
  return cachedUser;
}

export function clearSession() {
  accessToken = null;
  cachedUser = null;
  applyThemeForUser(null);
}
