import { getGoogleAuthUrl, loginRequest, syncSessionAfterAuth } from "../api.js";
import {
  attachPasswordToggles,
  clearFormFieldErrors,
  passwordToggleButtonHtml,
  setFieldError,
  wireClearErrorsOnInput,
} from "../authFormUi.js";
import { googleBrandSvgHtml } from "../googleBrandIcon.js";

function mapLoginError(err) {
  if (err?.status === 401) return "Invalid email or password.";
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  return "Something went wrong. Try again.";
}

export function mountLoginPage(root, router, onNavigate) {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-form-card">
        <h2 class="auth-title">Log in</h2>
        <form id="login-form" class="auth-form" novalidate>
          <div class="auth-field">
            <label class="auth-label" for="login-email">Email</label>
            <input id="login-email" name="email" type="email" required autocomplete="email"
              class="auth-input" placeholder="you@example.com"
              aria-describedby="login-email-error" />
            <p id="login-email-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="login-password">Password</label>
            <div class="auth-input-with-toggle">
              <input id="login-password" name="password" type="password" required autocomplete="current-password"
                class="auth-input" placeholder="Enter your password"
                aria-describedby="login-password-error" />
              ${passwordToggleButtonHtml()}
            </div>
            <p id="login-password-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <button type="submit" class="primary-button auth-submit">Log in</button>
        </form>
        <div class="auth-divider"><span>or</span></div>
        <button type="button" class="auth-button-google" id="login-google" aria-label="Continue with Google">
          ${googleBrandSvgHtml()}
          Continue with Google
        </button>
      </div>
      <p class="auth-footer">No account? <a href="/signup" data-navigo>Sign up</a></p>
    </div>
  `;

  const form = root.querySelector("#login-form");
  const googleBtn = root.querySelector("#login-google");
  const emailInput = root.querySelector("#login-email");
  const passwordInput = root.querySelector("#login-password");
  const emailError = root.querySelector("#login-email-error");
  const passwordError = root.querySelector("#login-password-error");

  attachPasswordToggles(root);
  wireClearErrorsOnInput(form);

  const onGoogle = () => {
    window.location.assign(getGoogleAuthUrl());
  };
  googleBtn.addEventListener("click", onGoogle);

  function validateClient() {
    clearFormFieldErrors(form);
    let ok = true;
    const email = emailInput.value.trim();
    if (!email) {
      setFieldError(emailInput, emailError, "Email is required.");
      ok = false;
    } else if (!emailInput.validity.valid) {
      setFieldError(emailInput, emailError, "Enter a valid email address.");
      ok = false;
    }
    const password = passwordInput.value;
    if (!password) {
      setFieldError(passwordInput, passwordError, "Password is required.");
      ok = false;
    }
    return ok;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validateClient()) return;
    try {
      const data = await loginRequest(emailInput.value.trim(), passwordInput.value);
      await syncSessionAfterAuth(data);
      onNavigate?.();
      router.navigate("/");
    } catch (err) {
      setFieldError(passwordInput, passwordError, mapLoginError(err));
    }
  };

  form.addEventListener("submit", onSubmit);
  return () => {
    googleBtn.removeEventListener("click", onGoogle);
    form.removeEventListener("submit", onSubmit);
    root.innerHTML = "";
  };
}
