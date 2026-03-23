import nodemailer from "nodemailer";

let cachedTransport = null;

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.MAIL_FROM?.trim()
  );
}

function getTransport() {
  if (cachedTransport) return cachedTransport;
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = port === 465;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cachedTransport;
}

/**
 * Full URL opened from the email (frontend reset page + token query).
 * Prefer PASSWORD_RESET_FRONTEND_URL; else first FRONTEND_ORIGIN + /reset-password.
 */
export function buildPasswordResetUrl(token) {
  const explicit = process.env.PASSWORD_RESET_FRONTEND_URL?.trim();
  if (explicit) {
    const base = explicit.replace(/\/$/, "");
    return `${base}?token=${encodeURIComponent(token)}`;
  }
  const origin = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

export function isEmailTransportReady() {
  return smtpConfigured();
}

/**
 * @param {{ to: string; resetUrl: string }} params
 */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  const from = process.env.MAIL_FROM?.trim();
  if (!from) {
    const err = new Error("MAIL_FROM is not configured");
    err.code = "MAIL_NOT_CONFIGURED";
    throw err;
  }

  const transport = getTransport();
  if (!transport) {
    const err = new Error("SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)");
    err.code = "MAIL_NOT_CONFIGURED";
    throw err;
  }

  const text = [
    "We received a request to reset your password.",
    "",
    "Open this link to choose a new password (valid for 1 hour):",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <p>We received a request to reset your password.</p>
    <p><a href="${resetUrl.replace(/"/g, "&quot;")}">Reset your password</a></p>
    <p>This link is valid for 1 hour. If you did not request this, you can ignore this email.</p>
  `.trim();

  await transport.sendMail({
    from,
    to,
    subject: "Reset your password",
    text,
    html,
  });
}
