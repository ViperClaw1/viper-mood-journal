/**
 * E2E-ish check: DB token lifecycle + Resend SMTP send.
 *
 * Usage (from backend/):
 *   E2E_RECIPIENT_EMAIL=you@gmail.com SMTP_PASS=re_... node scripts/test-password-reset-e2e.mjs
 *
 * Uses DATABASE_URL, MAIL_FROM, SMTP_* from .env or environment.
 * MAIL_FROM defaults to onboarding@resend.dev if unset (Resend test sender).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import { prisma } from "../lib/db.js";
import {
  buildPasswordResetUrl,
  isEmailTransportReady,
  sendPasswordResetEmail,
} from "../lib/mail.js";

const recipient =
  process.env.E2E_RECIPIENT_EMAIL?.trim() || process.argv[2]?.trim() || "";

async function verifySmtp() {
  const host = process.env.SMTP_HOST?.trim() || "smtp.resend.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim() || "resend";
  const pass = process.env.SMTP_PASS?.trim();
  if (!pass) throw new Error("SMTP_PASS is required for this script");

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transport.verify();
  console.log("[e2e] SMTP verify: OK");
}

async function main() {
  if (!recipient) {
    console.error(
      "Set E2E_RECIPIENT_EMAIL or pass inbox as argv[1] (where you can read the reset email)."
    );
    process.exit(1);
  }

  if (!process.env.MAIL_FROM?.trim()) {
    process.env.MAIL_FROM = "onboarding@resend.dev";
    console.log("[e2e] MAIL_FROM not set; using onboarding@resend.dev");
  }

  await verifySmtp();

  if (!isEmailTransportReady()) {
    throw new Error("Mail env incomplete after defaults");
  }

  const email = recipient.toLowerCase();
  const initialPassword = "E2Einitial1!";

  await prisma.user.deleteMany({ where: { email } }).catch(() => {});

  const passwordHash = await bcrypt.hash(initialPassword, 12);
  await prisma.user.create({
    data: { name: "E2E Password Reset", email, passwordHash },
  });
  console.log("[e2e] Created test user:", email);

  const token = randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.user.update({
    where: { email },
    data: { resetToken: token, resetTokenExpiry },
  });

  const resetUrl = buildPasswordResetUrl(token);
  await sendPasswordResetEmail({ to: email, resetUrl });
  console.log("[e2e] Resend: password reset email accepted for delivery");

  const newPassword = "E2Enewpass12!";
  const newHash = await bcrypt.hash(newPassword, 12);
  const now = new Date();
  const updated = await prisma.user.updateMany({
    where: {
      email,
      resetToken: token,
      resetTokenExpiry: { gt: now },
    },
    data: {
      passwordHash: newHash,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  if (updated.count !== 1) {
    throw new Error(`Expected updateMany count 1, got ${updated.count}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const loginOk = await bcrypt.compare(newPassword, user.passwordHash);
  if (!loginOk) throw new Error("New password hash did not verify");

  const reused = await prisma.user.updateMany({
    where: {
      email,
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
    data: { passwordHash: newHash },
  });
  if (reused.count !== 0) throw new Error("Token reuse should fail");

  await prisma.user.delete({ where: { email } });
  console.log("[e2e] Single-use reset + bcrypt verify: OK");
  console.log("[e2e] Cleanup: removed test user");
  console.log("[e2e] Check inbox for reset link:", recipient);
}

main().catch((err) => {
  console.error("[e2e] FAILED:", err.message || err);
  process.exit(1);
});
