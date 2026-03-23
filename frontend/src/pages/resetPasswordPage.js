import { resetPasswordRequest } from "../api.js";
import { attachPasswordToggles, passwordToggleButtonHtml } from "../authFormUi.js";

function isInvalidResetTokenError(err) {
  const msg = typeof err?.message === "string" ? err.message.toLowerCase() : "";
  return (
    err?.status === 400 &&
    (msg.includes("invalid") || msg.includes("expired") || msg.includes("reset link"))
  );
}

export function mountResetPasswordPage(root, router, tokenFromQuery) {
  const token = String(tokenFromQuery || "").trim();
  const hasToken = Boolean(token);

  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-form-card">
        <h2 class="auth-title">Reset password</h2>

        <div id="reset-missing-token" class="reset-password-notice" ${hasToken ? "hidden" : ""}>
          <p class="auth-error reset-password-notice__text" role="alert">
            This reset link is missing or incomplete. Open the link from your email or request a new one.
          </p>
          <p class="auth-footer reset-password-notice__actions">
            <a href="/forgot-password" data-navigo>Request a new reset link</a>
          </p>
        </div>

        <form id="reset-form" class="auth-form" novalidate ${!hasToken ? "hidden" : ""}>
          <div class="auth-field">
            <label class="auth-label" for="reset-password">New password (min 8 characters)</label>
            <div class="auth-input-with-toggle">
              <input id="reset-password" name="password" type="password" required autocomplete="new-password" minlength="8"
                class="auth-input" placeholder="At least 8 characters" />
              ${passwordToggleButtonHtml()}
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="reset-password-confirm">Confirm new password</label>
            <div class="auth-input-with-toggle">
              <input id="reset-password-confirm" name="passwordConfirm" type="password" required autocomplete="new-password" minlength="8"
                class="auth-input" placeholder="Re-enter your password" aria-describedby="reset-confirm-error" />
              ${passwordToggleButtonHtml()}
            </div>
            <p id="reset-confirm-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <p id="reset-success" class="auth-success" role="status" hidden></p>
          <button type="submit" class="primary-button auth-submit" id="reset-submit-btn">Update password</button>
        </form>

        <div id="reset-token-error-wrap" class="reset-password-notice" hidden>
          <p id="reset-token-error-msg" class="auth-error reset-password-notice__text" role="alert"></p>
          <p class="auth-footer reset-password-notice__actions">
            <a href="/forgot-password" data-navigo>Request a new reset link</a>
          </p>
        </div>
      </div>
      <p class="auth-footer"><a href="/login" data-navigo>Back to log in</a></p>
    </div>
  `;

  const form = root.querySelector("#reset-form");
  const missingPanel = root.querySelector("#reset-missing-token");
  const tokenErrorWrap = root.querySelector("#reset-token-error-wrap");
  const tokenErrorMsg = root.querySelector("#reset-token-error-msg");
  const pwdInput = root.querySelector("#reset-password");
  const confirmInput = root.querySelector("#reset-password-confirm");
  const confirmErr = root.querySelector("#reset-confirm-error");
  const okEl = root.querySelector("#reset-success");
  const submitBtn = root.querySelector("#reset-submit-btn");

  if (hasToken && form) {
    attachPasswordToggles(form);
  }

  let redirectId = null;

  const clearConfirmError = () => {
    confirmErr.textContent = "";
    confirmErr.hidden = true;
    confirmInput.setAttribute("aria-invalid", "false");
  };

  confirmInput.addEventListener("input", clearConfirmError);
  pwdInput?.addEventListener("input", clearConfirmError);

  const onSubmit = async (e) => {
    e.preventDefault();
    clearConfirmError();
    tokenErrorWrap.hidden = true;
    okEl.hidden = true;

    const password = String(pwdInput?.value || "");
    const confirm = String(confirmInput?.value || "");
    if (password !== confirm) {
      confirmErr.textContent = "Passwords do not match.";
      confirmErr.hidden = false;
      confirmInput.setAttribute("aria-invalid", "true");
      return;
    }
    if (password.length < 8) {
      confirmErr.textContent = "Password must be at least 8 characters.";
      confirmErr.hidden = false;
      pwdInput?.setAttribute("aria-invalid", "true");
      return;
    }
    pwdInput?.setAttribute("aria-invalid", "false");

    try {
      await resetPasswordRequest(token, password);
      okEl.textContent = "Password updated. Redirecting to log in…";
      okEl.hidden = false;
      form.hidden = true;
      if (submitBtn) submitBtn.disabled = true;
      redirectId = setTimeout(() => {
        redirectId = null;
        router.navigate("/login");
      }, 3000);
    } catch (err) {
      const friendly =
        isInvalidResetTokenError(err) || /invalid|expired/i.test(err?.message || "")
          ? "This reset link is invalid or has expired."
          : err.message || "Reset failed.";
      tokenErrorMsg.textContent = friendly;
      tokenErrorWrap.hidden = false;
      form.hidden = true;
      if (submitBtn) submitBtn.disabled = true;
    }
  };

  if (hasToken && form) {
    form.addEventListener("submit", onSubmit);
  }

  return () => {
    if (redirectId != null) {
      clearTimeout(redirectId);
      redirectId = null;
    }
    if (hasToken && form) {
      form.removeEventListener("submit", onSubmit);
    }
    confirmInput?.removeEventListener("input", clearConfirmError);
    pwdInput?.removeEventListener("input", clearConfirmError);
    root.innerHTML = "";
  };
}
