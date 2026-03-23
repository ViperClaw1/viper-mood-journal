import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { passport } from "../lib/passport.js";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  buildPasswordResetUrl,
  isEmailTransportReady,
  sendPasswordResetEmail,
} from "../lib/mail.js";
import { toPublicUser } from "../lib/userPublic.js";

const TOKEN_TTL = "7d";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_MESSAGE =
  "If an account exists for this email, you will receive reset instructions.";
const COOKIE_NAME = "auth_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    const err = new Error("JWT_SECRET is not configured");
    err.statusCode = 500;
    throw err;
  }
  return secret.trim();
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function issueAuthCookie(res, user) {
  const token = jwt.sign({ email: user.email }, getJwtSecret(), {
    subject: user.id,
    expiresIn: TOKEN_TTL,
  });
  res.cookie(COOKIE_NAME, token, getCookieOptions());
  return token;
}

export async function authRegisterPost(req, res, next) {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    const accessToken = issueAuthCookie(res, user);
    return res.status(201).json({ user: toPublicUser(user), accessToken });
  } catch (err) {
    return next(err);
  }
}

export async function authLoginPost(req, res, next) {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const accessToken = issueAuthCookie(res, user);
    return res.status(200).json({ user: toPublicUser(user), accessToken });
  } catch (err) {
    return next(err);
  }
}

/** Cookie-only session hydration for SPA (same JWT as HttpOnly cookie, for in-memory Bearer). */
export async function authSessionGet(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token || typeof token !== "string") {
      return res.status(401).json({ error: "Not authenticated" });
    }

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.status(200).json({ user: toPublicUser(user), accessToken: token });
  } catch (err) {
    return next(err);
  }
}

export async function authForgotPasswordPost(req, res, next) {
  try {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const respondOk = () => res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return respondOk();
    }

    const token = randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry },
    });

    if (!isEmailTransportReady()) {
      console.warn("[auth] forgot-password: SMTP not configured; email not sent for", email);
      return respondOk();
    }

    const resetUrl = buildPasswordResetUrl(token);
    try {
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (err) {
      console.error("[auth] forgot-password: failed to send email:", err?.message ?? err);
    }

    return respondOk();
  } catch (err) {
    return next(err);
  }
}

export async function authResetPasswordPost(req, res, next) {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!token || !password) {
      return res.status(400).json({ error: "token and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }

    const user = await prisma.user.findFirst({ where: { resetToken: token } });
    const now = new Date();
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry <= now) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        resetToken: token,
        resetTokenExpiry: { gt: now },
      },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    if (updated.count === 0) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    return res.status(200).json({ message: "Password updated" });
  } catch (err) {
    return next(err);
  }
}

/**
 * All auth endpoints under `/auth` via `app.use("/auth", createAuthRouter())`.
 * Avoids any ambiguity with top-level `app.post("/auth/...")` vs Express 5 / tooling.
 */
export function createAuthRouter() {
  const r = Router();

  r.get("/register", (req, res) => {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
      hint: "Use POST /auth/register with JSON body: { name, email, password }",
    });
  });

  r.get("/login", (req, res) => {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
      hint: "Use POST /auth/login with JSON body: { email, password }",
    });
  });

  r.post("/register", authRegisterPost);
  r.post("/login", authLoginPost);
  // forgot-password + reset-password are registered on app in index.js

  r.post("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, getCookieOptions());
    return res.status(204).send();
  });

  r.get("/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth is not configured" });
    }
    return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  r.get("/google/callback", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth is not configured" });
    }

    return passport.authenticate("google", { session: false }, async (err, user) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Google authentication failed" });

      const accessToken = issueAuthCookie(res, user);

      const redirectBase = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
        .split(",")[0]
        ?.trim()
        ?.replace(/\/$/, "");
      const url = new URL(redirectBase || "http://localhost:5173");
      url.pathname = "/";
      url.search = "";
      url.hash = "";
      url.searchParams.set("accessToken", accessToken);
      return res.redirect(302, url.toString());
    })(req, res, next);
  });

  r.get("/me", requireAuth, async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ user: toPublicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  r.get("/ping", (_req, res) => res.json({ ok: true, auth: "mounted" }));

  return r;
}
