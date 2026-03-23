import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { passport } from "./lib/passport.js";
import {
  authForgotPasswordPost,
  authResetPasswordPost,
  authSessionGet,
  createAuthRouter,
} from "./routes/auth.js";
import { requireAuth } from "./middleware/authMiddleware.js";
import { entriesRouter } from "./routes/entries.js";
import { createUsersRouter } from "./routes/users.js";

/** Set on every response so Postman can prove you hit this API (not another process on :3000) */
const API_ID = "mood-journal-api";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, res, next) => {
  res.setHeader("X-Mood-Journal-Api", API_ID);
  next();
});

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
if (allowedOrigins.length === 0) allowedOrigins.push("*");

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      // Reflect request origin when * so browsers accept credentialed requests (cookies)
      if (allowedOrigins.includes("*")) return cb(null, origin);
      const normalized = origin.replace(/\/$/, "");
      return cb(null, allowedOrigins.includes(normalized));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());
// Bind on main app so these always match (same pattern as historical /auth/register issues with nested Router in some setups)
app.post("/auth/forgot-password", authForgotPasswordPost);
app.post("/auth/reset-password", authResetPasswordPost);
app.get("/auth/session", authSessionGet);
app.use("/auth", createAuthRouter());
app.use("/users", createUsersRouter());

app.get("/", (req, res) => {
  res.status(200).json({ ok: true, message: "Mood journal API" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/entries/ai-status", (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) });
});

app.use("/entries", requireAuth, entriesRouter);

/** 404 when no route matched – log so we can see what Express actually received */
app.use((req, res, next) => {
  console.log("404 – no route matched:", req.method, req.path, "url:", req.url, "originalUrl:", req.originalUrl);
  res.status(404).json({
    error: "Not found",
    method: req.method,
    path: req.path,
    api: API_ID,
    hint: "If api is missing, you are not hitting this server. Rebuild Docker or fix port/process.",
  });
});

app.use((err, req, res, next) => {
  if (err) {
    const code = err?.code;
    const meta = err?.meta;
    console.error(err?.stack ?? err, code ? `[${code}]` : "", meta ? JSON.stringify(meta) : "");
  }
  const status = err?.statusCode ?? 500;
  const message = err?.message ?? "Internal server error";
  if (!res.headersSent) res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[${API_ID}] pid=${process.pid} listening on http://localhost:${PORT}`);
});
