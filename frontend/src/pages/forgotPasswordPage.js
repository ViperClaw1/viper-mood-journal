import { forgotPasswordRequest } from "../api.js";

const FORGOT_SUCCESS_COPY = "If this email exists, a reset link has been sent.";

export function mountForgotPasswordPage(root) {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-form-card">
        <h2 class="auth-title">Forgot password</h2>
        <p class="auth-hint">Enter your email and we will send reset instructions if an account exists.</p>
        <form id="forgot-form" class="auth-form" novalidate>
          <div class="auth-field">
            <label class="auth-label" for="forgot-email">Email</label>
            <input id="forgot-email" name="email" type="email" required autocomplete="email" class="auth-input"
              placeholder="you@example.com" aria-describedby="forgot-email-error" />
            <p id="forgot-email-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <p id="forgot-error" class="auth-error" role="alert" hidden></p>
          <p id="forgot-success" class="auth-success" role="status" hidden></p>
          <button type="submit" class="primary-button auth-submit">Send reset link</button>
        </form>
      </div>
      <p class="auth-footer"><a href="/login" data-navigo>Back to log in</a></p>
    </div>
  `;

  const form = root.querySelector("#forgot-form");
  const emailInput = root.querySelector("#forgot-email");
  const emailErr = root.querySelector("#forgot-email-error");
  const errEl = root.querySelector("#forgot-error");
  const okEl = root.querySelector("#forgot-success");

  const onSubmit = async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    okEl.hidden = true;
    emailErr.hidden = true;
    emailErr.textContent = "";
    const email = emailInput.value.trim();
    if (!email) {
      emailErr.textContent = "Email is required.";
      emailErr.hidden = false;
      emailInput.setAttribute("aria-invalid", "true");
      return;
    }
    if (!emailInput.validity.valid) {
      emailErr.textContent = "Enter a valid email address.";
      emailErr.hidden = false;
      emailInput.setAttribute("aria-invalid", "true");
      return;
    }
    emailInput.setAttribute("aria-invalid", "false");
    try {
      await forgotPasswordRequest(email);
      okEl.textContent = FORGOT_SUCCESS_COPY;
      okEl.hidden = false;
    } catch (err) {
      errEl.textContent = err.message || "Request failed";
      errEl.hidden = false;
    }
  };

  const onEmailInput = () => {
    emailErr.hidden = true;
    emailErr.textContent = "";
    emailInput.setAttribute("aria-invalid", "false");
  };
  emailInput.addEventListener("input", onEmailInput);

  form.addEventListener("submit", onSubmit);
  return () => {
    form.removeEventListener("submit", onSubmit);
    emailInput.removeEventListener("input", onEmailInput);
    root.innerHTML = "";
  };
}
