import nodemailer from "nodemailer";

let cachedTransport = null;
const MAIL_SEND_TIMEOUT_MS = 12000;
const RESEND_API_URL = "https://api.resend.com/emails";

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
    // Prevent requests from hanging forever on unreachable/blocked SMTP in production.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
  });
  return cachedTransport;
}

function getResendApiKey() {
  const direct = process.env.RESEND_API_KEY?.trim();
  if (direct) return direct;

  const host = process.env.SMTP_HOST?.trim().toLowerCase();
  const smtpPass = process.env.SMTP_PASS?.trim();
  // Resend SMTP password is typically an API key starting with "re_".
  if (host === "smtp.resend.com" && smtpPass?.startsWith("re_")) {
    return smtpPass;
  }
  return "";
}

async function sendViaResendApi({ from, to, subject, text, html }) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    const err = new Error("Resend API key is not configured");
    err.code = "RESEND_API_KEY_MISSING";
    throw err;
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), MAIL_SEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: ac.signal,
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const err = new Error(`Resend API HTTP ${res.status}${raw ? `: ${raw}` : ""}`);
      err.code = "RESEND_API_HTTP_ERROR";
      throw err;
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error(`Resend API timeout after ${MAIL_SEND_TIMEOUT_MS}ms`);
      timeoutErr.code = "RESEND_API_TIMEOUT";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
  return smtpConfigured() || Boolean(getResendApiKey());
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

  const subject = "Reset your password";
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

  const transport = getTransport();
  if (transport) {
    const sendPromise = transport.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`SMTP send timeout after ${MAIL_SEND_TIMEOUT_MS}ms`);
        err.code = "MAIL_SEND_TIMEOUT";
        reject(err);
      }, MAIL_SEND_TIMEOUT_MS);
    });

    try {
      await Promise.race([sendPromise, timeoutPromise]);
      return;
    } catch (err) {
      const code = err?.code ?? "";
      // Railway/prod often blocks or stalls SMTP; fallback to Resend HTTPS API.
      if (code !== "MAIL_SEND_TIMEOUT" && code !== "ESOCKET" && code !== "ETIMEDOUT") {
        throw err;
      }
      console.warn("[mail] SMTP failed, falling back to Resend API:", err?.message ?? err);
    }
  }

  if (!getResendApiKey()) {
    const err = new Error("No working mail transport configured (SMTP failed and Resend API key missing)");
    err.code = "MAIL_NOT_CONFIGURED";
    throw err;
  }
  await sendViaResendApi({ from, to, subject, text, html });
}
