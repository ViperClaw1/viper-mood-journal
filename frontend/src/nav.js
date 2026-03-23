import { getAccessToken, clearSession } from "./authSession.js";
import { logoutRequest } from "./api.js";

export async function handleLogout(router) {
  try {
    await logoutRequest();
  } catch {
    /* still clear client */
  }
  clearSession();
  router.navigate("/login");
  renderNav(router);
  router.updatePageLinks();
}

export function renderNav(router) {
  const el = document.getElementById("app-nav");
  if (!el || !router?.updatePageLinks) return;

  const authed = Boolean(getAccessToken());

  if (authed) {
    el.innerHTML = `
      <a href="/" class="nav-link" data-navigo>Journal</a>
      <a href="/settings" class="nav-link" data-navigo>Settings</a>
      <button type="button" class="nav-link nav-link-btn" id="nav-logout">Log out</button>
    `;
    el.querySelector("#nav-logout")?.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout(router);
    });
  } else {
    el.innerHTML = `
      <a href="/login" class="nav-link" data-navigo>Log in</a>
      <a href="/signup" class="nav-link" data-navigo>Sign up</a>
      <a href="/forgot-password" class="nav-link" data-navigo>Forgot password</a>
    `;
  }

  router.updatePageLinks();
}
