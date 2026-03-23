import { getGoogleAuthUrl, registerRequest, syncSessionAfterAuth } from "../api.js";
import {
  attachPasswordToggles,
  clearFormFieldErrors,
  passwordToggleButtonHtml,
  setFieldError,
  wireClearErrorsOnInput,
} from "../authFormUi.js";
import { googleBrandSvgHtml } from "../googleBrandIcon.js";

function mapSignupError(err) {
  if (err?.status === 409) return { field: "email", message: "An account with that email already exists." };
  const msg =
    typeof err?.message === "string" && err.message.trim()
      ? err.message.trim()
      : "Something went wrong. Try again.";
  const lower = msg.toLowerCase();
  if (lower.includes("password")) return { field: "password", message: msg };
  if (lower.includes("email")) return { field: "email", message: msg };
  if (lower.includes("name")) return { field: "name", message: msg };
  return { field: "name", message: msg };
}

export function mountSignupPage(root, router, onNavigate) {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-form-card">
        <h2 class="auth-title">Sign up</h2>
        <form id="signup-form" class="auth-form" novalidate>
          <div class="auth-field">
            <label class="auth-label" for="signup-name">Name</label>
            <input id="signup-name" name="name" type="text" required autocomplete="name" minlength="1"
              class="auth-input" placeholder="Your name"
              aria-describedby="signup-name-error" />
            <p id="signup-name-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signup-email">Email</label>
            <input id="signup-email" name="email" type="email" required autocomplete="email"
              class="auth-input" placeholder="you@example.com"
              aria-describedby="signup-email-error" />
            <p id="signup-email-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signup-password">Password (min 8 characters)</label>
            <div class="auth-input-with-toggle">
              <input id="signup-password" name="password" type="password" required autocomplete="new-password" minlength="8"
                class="auth-input" placeholder="At least 8 characters"
                aria-describedby="signup-password-error" />
              ${passwordToggleButtonHtml()}
            </div>
            <p id="signup-password-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signup-password-confirm">Confirm password</label>
            <div class="auth-input-with-toggle">
              <input id="signup-password-confirm" name="passwordConfirm" type="password" required autocomplete="new-password" minlength="8"
                class="auth-input" placeholder="Re-enter your password"
                aria-describedby="signup-password-confirm-error" />
              ${passwordToggleButtonHtml()}
            </div>
            <p id="signup-password-confirm-error" class="field-inline-error" role="alert" hidden></p>
          </div>
          <button type="submit" class="primary-button auth-submit">Create account</button>
        </form>
        <div class="auth-divider"><span>or</span></div>
        <button type="button" class="auth-button-google" id="signup-google" aria-label="Continue with Google">
          ${googleBrandSvgHtml()}
          Continue with Google
        </button>
      </div>
      <p class="auth-footer">Already have an account? <a href="/login" data-navigo>Log in</a></p>
    </div>
  `;

  const form = root.querySelector("#signup-form");
  const googleBtn = root.querySelector("#signup-google");
  const nameInput = root.querySelector("#signup-name");
  const emailInput = root.querySelector("#signup-email");
  const passwordInput = root.querySelector("#signup-password");
  const confirmInput = root.querySelector("#signup-password-confirm");
  const nameError = root.querySelector("#signup-name-error");
  const emailError = root.querySelector("#signup-email-error");
  const passwordError = root.querySelector("#signup-password-error");
  const confirmError = root.querySelector("#signup-password-confirm-error");

  attachPasswordToggles(root);
  wireClearErrorsOnInput(form);
  passwordInput.addEventListener("input", () => {
    setFieldError(confirmInput, confirmError, "");
  });

  const onGoogle = () => {
    window.location.assign(getGoogleAuthUrl());
  };
  googleBtn.addEventListener("click", onGoogle);

  function validateClient() {
    clearFormFieldErrors(form);
    let ok = true;
    const name = nameInput.value.trim();
    if (!name) {
      setFieldError(nameInput, nameError, "Name is required.");
      ok = false;
    }
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
    } else if (password.length < 8) {
      setFieldError(passwordInput, passwordError, "Password must be at least 8 characters.");
      ok = false;
    }
    const confirm = confirmInput.value;
    if (!confirm) {
      setFieldError(confirmInput, confirmError, "Confirm your password.");
      ok = false;
    } else if (password !== confirm) {
      setFieldError(confirmInput, confirmError, "Passwords do not match.");
      ok = false;
    }
    return ok;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validateClient()) return;
    try {
      const data = await registerRequest(
        nameInput.value.trim(),
        emailInput.value.trim(),
        passwordInput.value
      );
      await syncSessionAfterAuth(data);
      onNavigate?.();
      router.navigate("/");
    } catch (err) {
      const { field, message } = mapSignupError(err);
      if (field === "email") setFieldError(emailInput, emailError, message);
      else if (field === "password") setFieldError(passwordInput, passwordError, message);
      else setFieldError(nameInput, nameError, message);
    }
  };

  form.addEventListener("submit", onSubmit);
  return () => {
    googleBtn.removeEventListener("click", onGoogle);
    form.removeEventListener("submit", onSubmit);
    root.innerHTML = "";
  };
}
