/** Eye open — password is hidden (click to show). */
const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20" data-icon="eye-open" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;

/** Eye slash — password is visible (click to hide). */
const EYE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20" data-icon="eye-off" hidden aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 13 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c5.756 0 9.775 3.162 11.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`;

export function passwordToggleButtonHtml() {
  return `<button type="button" class="auth-password-toggle" aria-label="Show password" aria-pressed="false"><span class="auth-password-toggle-icons">${EYE_OPEN}${EYE_OFF}</span></button>`;
}

export function attachPasswordToggles(scope) {
  const root = scope ?? document;
  root.querySelectorAll(".auth-input-with-toggle").forEach((wrap) => {
    const input = wrap.querySelector("input.auth-input");
    const btn = wrap.querySelector(".auth-password-toggle");
    const openEye = btn?.querySelector('[data-icon="eye-open"]');
    const offEye = btn?.querySelector('[data-icon="eye-off"]');
    if (!input || !btn || !openEye || !offEye) return;

    const syncIcons = () => {
      const visible = input.type === "text";
      openEye.hidden = visible;
      offEye.hidden = !visible;
      btn.setAttribute("aria-pressed", String(visible));
      btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    };

    btn.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      syncIcons();
    });
    syncIcons();
  });
}

export function setFieldError(input, errEl, message) {
  const text = typeof message === "string" ? message.trim() : "";
  errEl.textContent = text;
  errEl.hidden = !text;
  if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
}

export function clearFormFieldErrors(formRoot) {
  formRoot.querySelectorAll(".field-inline-error").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
  });
  formRoot.querySelectorAll("input.auth-input").forEach((inp) => {
    inp.setAttribute("aria-invalid", "false");
  });
}

/** Clear this field's error when user edits. */
export function wireClearErrorsOnInput(formRoot) {
  formRoot.querySelectorAll(".auth-field").forEach((field) => {
    const err = field.querySelector(".field-inline-error");
    const input = field.querySelector(".auth-input-with-toggle input") || field.querySelector(".auth-input");
    if (!err || !input) return;
    input.addEventListener("input", () => setFieldError(input, err, ""));
  });
}
