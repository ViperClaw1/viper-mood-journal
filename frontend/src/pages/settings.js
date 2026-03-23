import {
  getMeRequest,
  updateMeRequest,
  updatePasswordRequest,
  uploadAvatarRequest,
} from "../api.js";
import { attachPasswordToggles, passwordToggleButtonHtml } from "../authFormUi.js";
import { setSession, getAccessToken, getCachedUser } from "../authSession.js";
import { applyThemeForUser } from "../theme.js";

function mapPasswordError(err) {
  if (err?.status === 401) return "Current password is incorrect.";
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  return "Could not update password.";
}

const THEME_ICONS_HTML = `
  <span class="settings-theme-icons" aria-hidden="true">
    <svg class="theme-moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
    <svg class="theme-sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  </span>
`;

function setThemeToggleAria(button, theme) {
  const dark = theme === "DARK";
  button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  button.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
}

/** Dev: API returns absolute localhost:3000 URLs; use same-origin path so Vite proxies /uploads → API. */
function normalizeAvatarUrlForDisplay(url) {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u || typeof window === "undefined") return u;
  try {
    const parsed = new URL(u);
    const apiLocal =
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && parsed.port === "3000";
    const viteDev =
      window.location.hostname === "localhost" && window.location.port === "5173";
    if (apiLocal && viteDev && parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep as-is (relative or odd URL) */
  }
  return u;
}

function setAvatarPreview(wrap, previewImg, _placeholder, url) {
  const raw = typeof url === "string" ? url.trim() : "";
  const displayUrl = normalizeAvatarUrlForDisplay(raw);
  wrap.classList.toggle("has-avatar", Boolean(displayUrl));
  previewImg.alt = displayUrl ? "Profile photo" : "";
  previewImg.onload = null;
  previewImg.onerror = null;
  if (displayUrl) {
    previewImg.onerror = () => {
      previewImg.onerror = null;
      wrap.classList.remove("has-avatar");
      previewImg.removeAttribute("src");
      previewImg.alt = "";
    };
    previewImg.src = displayUrl;
  } else {
    previewImg.removeAttribute("src");
  }
}

export function mountSettingsPage(root, onNavigate) {
  root.innerHTML = `
    <div class="settings-page">
      <h2 class="auth-title">Settings</h2>
      <p id="settings-load-error" class="auth-error" role="alert" hidden></p>
      <div id="settings-content" class="settings-stack" hidden>
        <section class="auth-form-card settings-block" aria-labelledby="settings-profile-heading">
          <h3 id="settings-profile-heading" class="settings-section-title">Profile</h3>
          <form id="profile-form" class="auth-form" novalidate>
            <div class="auth-field">
              <label class="auth-label" for="settings-email">Email</label>
              <input id="settings-email" type="email" class="auth-input settings-input-readonly" readonly autocomplete="username" />
              <p class="settings-readonly-hint">Email cannot be changed.</p>
            </div>
            <div class="auth-field">
              <label class="auth-label">Profile photo</label>
              <div class="settings-avatar-row">
                <div id="settings-avatar-preview-wrap" class="settings-avatar-preview-wrap">
                  <img id="settings-avatar-preview" class="settings-avatar-preview" alt="" width="72" height="72" />
                  <div id="settings-avatar-placeholder" class="settings-avatar-placeholder">No photo</div>
                </div>
                <div class="settings-avatar-actions">
                  <input type="file" id="settings-avatar-file" accept="image/jpeg,image/png,image/webp" hidden />
                  <button type="button" class="secondary-button settings-avatar-upload-btn" id="settings-avatar-pick">
                    Upload photo
                  </button>
                  <button type="button" class="nav-link-btn settings-avatar-remove-btn" id="settings-avatar-remove" hidden>
                    Remove photo
                  </button>
                </div>
              </div>
              <p id="avatar-upload-err" class="auth-error" role="alert" hidden></p>
            </div>
            <div class="auth-field">
              <label class="auth-label" for="settings-name">Name</label>
              <input id="settings-name" name="name" type="text" required class="auth-input" autocomplete="name" />
            </div>
            <p id="profile-msg" class="auth-success" role="status" hidden></p>
            <p id="profile-err" class="auth-error" role="alert" hidden></p>
            <button type="submit" class="primary-button auth-submit">Save profile</button>
          </form>
        </section>

        <section class="auth-form-card settings-block" aria-labelledby="settings-appearance-heading">
          <h3 id="settings-appearance-heading" class="settings-section-title">Appearance</h3>
          <div class="settings-theme-row">
            <span class="settings-theme-label">Theme</span>
            <button type="button" id="settings-theme-toggle" class="settings-theme-toggle">
              ${THEME_ICONS_HTML}
            </button>
          </div>
          <p id="settings-theme-hint" class="settings-readonly-hint">Tap the icon to switch. Saves to your account.</p>
          <p id="theme-msg" class="auth-success" role="status" hidden></p>
          <p id="theme-err" class="auth-error" role="alert" hidden></p>
        </section>

        <section class="auth-form-card settings-block" aria-labelledby="settings-security-heading">
          <h3 id="settings-security-heading" class="settings-section-title">Security</h3>
          <form id="password-form" class="auth-form" novalidate>
            <div class="auth-field">
              <label class="auth-label" for="settings-current-pwd">Current password</label>
              <input id="settings-current-pwd" name="currentPassword" type="password" autocomplete="current-password" class="auth-input" />
            </div>
            <div class="auth-field">
              <label class="auth-label" for="settings-new-pwd">New password</label>
              <div class="auth-input-with-toggle">
                <input id="settings-new-pwd" name="newPassword" type="password" autocomplete="new-password" minlength="8" class="auth-input" />
                ${passwordToggleButtonHtml()}
              </div>
            </div>
            <div class="auth-field">
              <label class="auth-label" for="settings-confirm-pwd">Confirm new password</label>
              <div class="auth-input-with-toggle">
                <input id="settings-confirm-pwd" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" class="auth-input" />
                ${passwordToggleButtonHtml()}
              </div>
            </div>
            <p id="pwd-msg" class="auth-success" role="status" hidden></p>
            <p id="pwd-err" class="auth-error" role="alert" hidden></p>
            <button type="submit" class="primary-button auth-submit">Update password</button>
          </form>
        </section>
      </div>
    </div>
  `;

  const loadErr = root.querySelector("#settings-load-error");
  const content = root.querySelector("#settings-content");
  const profileForm = root.querySelector("#profile-form");
  const passwordForm = root.querySelector("#password-form");
  const emailInput = root.querySelector("#settings-email");
  const nameInput = root.querySelector("#settings-name");
  const avatarFile = root.querySelector("#settings-avatar-file");
  const avatarPick = root.querySelector("#settings-avatar-pick");
  const avatarRemove = root.querySelector("#settings-avatar-remove");
  const avatarPreviewWrap = root.querySelector("#settings-avatar-preview-wrap");
  const avatarPreview = root.querySelector("#settings-avatar-preview");
  const avatarPlaceholder = root.querySelector("#settings-avatar-placeholder");
  const avatarUploadErr = root.querySelector("#avatar-upload-err");
  const themeToggle = root.querySelector("#settings-theme-toggle");
  const profileMsg = root.querySelector("#profile-msg");
  const profileErr = root.querySelector("#profile-err");
  const themeMsg = root.querySelector("#theme-msg");
  const themeErr = root.querySelector("#theme-err");
  const pwdMsg = root.querySelector("#pwd-msg");
  const pwdErr = root.querySelector("#pwd-err");

  attachPasswordToggles(passwordForm);

  let disposed = false;
  let themeBusy = false;

  function syncRemoveVisibility(hasUrl) {
    avatarRemove.hidden = !hasUrl;
  }

  const cached = getCachedUser();
  if (cached?.avatarUrl) {
    setAvatarPreview(avatarPreviewWrap, avatarPreview, avatarPlaceholder, cached.avatarUrl);
    syncRemoveVisibility(true);
  }

  (async () => {
    try {
      const data = await getMeRequest();
      if (disposed) return;
      const u = data.user;
      emailInput.value = u.email || "";
      nameInput.value = u.name || "";
      const url = u.avatarUrl || "";
      setAvatarPreview(avatarPreviewWrap, avatarPreview, avatarPlaceholder, url);
      syncRemoveVisibility(Boolean(url));
      setThemeToggleAria(themeToggle, u.theme === "DARK" ? "DARK" : "LIGHT");
      content.hidden = false;
    } catch (err) {
      if (disposed) return;
      loadErr.textContent = err.message || "Could not load profile";
      loadErr.hidden = false;
    }
  })();

  const onAvatarPickClick = () => avatarFile.click();
  avatarPick.addEventListener("click", onAvatarPickClick);

  const onAvatarFileChange = async () => {
    avatarUploadErr.hidden = true;
    const file = avatarFile.files?.[0];
    avatarFile.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      avatarUploadErr.textContent = "Use a JPEG, PNG, or WebP image.";
      avatarUploadErr.hidden = false;
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      avatarUploadErr.textContent = "Image must be at most 2 MB.";
      avatarUploadErr.hidden = false;
      return;
    }
    try {
      const data = await uploadAvatarRequest(file);
      if (disposed) return;
      const url = data.user?.avatarUrl || "";
      setAvatarPreview(avatarPreviewWrap, avatarPreview, avatarPlaceholder, url);
      syncRemoveVisibility(Boolean(url));
      if (data.user && getAccessToken()) {
        setSession(getAccessToken(), data.user);
      }
      onNavigate?.();
      profileMsg.textContent = "Profile photo updated.";
      profileMsg.hidden = false;
    } catch (err) {
      if (disposed) return;
      avatarUploadErr.textContent = err.message || "Upload failed";
      avatarUploadErr.hidden = false;
    }
  };
  avatarFile.addEventListener("change", onAvatarFileChange);

  const onAvatarRemoveClick = async () => {
    avatarUploadErr.hidden = true;
    try {
      const data = await updateMeRequest({ avatarUrl: "" });
      if (disposed) return;
      setAvatarPreview(avatarPreviewWrap, avatarPreview, avatarPlaceholder, "");
      syncRemoveVisibility(false);
      if (data.user && getAccessToken()) {
        setSession(getAccessToken(), data.user);
      }
      onNavigate?.();
      profileMsg.textContent = "Profile photo removed.";
      profileMsg.hidden = false;
    } catch (err) {
      if (disposed) return;
      avatarUploadErr.textContent = err.message || "Could not remove photo";
      avatarUploadErr.hidden = false;
    }
  };
  avatarRemove.addEventListener("click", onAvatarRemoveClick);

  const onProfile = async (e) => {
    e.preventDefault();
    profileMsg.hidden = true;
    profileErr.hidden = true;
    const name = nameInput.value.trim();
    try {
      const data = await updateMeRequest({ name });
      if (data.user && getAccessToken()) {
        setSession(getAccessToken(), data.user);
      }
      onNavigate?.();
      profileMsg.textContent = "Profile saved.";
      profileMsg.hidden = false;
    } catch (err) {
      profileErr.textContent = err.message || "Save failed";
      profileErr.hidden = false;
    }
  };

  const onThemeToggle = async () => {
    if (themeBusy) return;
    const prevUser = getCachedUser();
    const current = prevUser?.theme === "DARK" ? "DARK" : "LIGHT";
    const nextTheme = current === "DARK" ? "LIGHT" : "DARK";
    themeMsg.hidden = true;
    themeErr.hidden = true;
    applyThemeForUser({ ...prevUser, theme: nextTheme });
    setThemeToggleAria(themeToggle, nextTheme);
    themeBusy = true;
    try {
      const data = await updateMeRequest({ theme: nextTheme });
      if (data.user && getAccessToken()) {
        setSession(getAccessToken(), data.user);
      }
      onNavigate?.();
      const savedTheme = data.user?.theme === "DARK" ? "DARK" : "LIGHT";
      setThemeToggleAria(themeToggle, savedTheme);
      themeMsg.textContent = "Theme saved.";
      themeMsg.hidden = false;
    } catch (err) {
      applyThemeForUser(prevUser);
      setThemeToggleAria(themeToggle, prevUser?.theme === "DARK" ? "DARK" : "LIGHT");
      themeErr.textContent = err.message || "Could not save theme";
      themeErr.hidden = false;
    } finally {
      themeBusy = false;
    }
  };

  const onPassword = async (e) => {
    e.preventDefault();
    pwdMsg.hidden = true;
    pwdErr.hidden = true;
    const fd = new FormData(passwordForm);
    const currentPassword = String(fd.get("currentPassword") || "");
    const newPassword = String(fd.get("newPassword") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) {
      pwdErr.textContent = "New passwords do not match.";
      pwdErr.hidden = false;
      return;
    }
    if (newPassword.length < 8) {
      pwdErr.textContent = "New password must be at least 8 characters.";
      pwdErr.hidden = false;
      return;
    }
    try {
      await updatePasswordRequest(currentPassword, newPassword);
      passwordForm.reset();
      pwdMsg.textContent = "Password updated.";
      pwdMsg.hidden = false;
    } catch (err) {
      pwdErr.textContent = mapPasswordError(err);
      pwdErr.hidden = false;
    }
  };

  profileForm.addEventListener("submit", onProfile);
  passwordForm.addEventListener("submit", onPassword);
  themeToggle.addEventListener("click", onThemeToggle);

  return () => {
    disposed = true;
    profileForm.removeEventListener("submit", onProfile);
    passwordForm.removeEventListener("submit", onPassword);
    themeToggle.removeEventListener("click", onThemeToggle);
    avatarPick.removeEventListener("click", onAvatarPickClick);
    avatarFile.removeEventListener("change", onAvatarFileChange);
    avatarRemove.removeEventListener("click", onAvatarRemoveClick);
    root.innerHTML = "";
  };
}
