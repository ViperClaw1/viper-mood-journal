import "dotenv/config";
import cors from "cors";
import express from "express";
import { entriesRouter, deleteEntryHandler } from "./routes/entries.js";

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
if (allowedOrigins.length === 0) allowedOrigins.push("*");

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes("*")) return cb(null, true);
      const normalized = origin.replace(/\/$/, "");
      return cb(null, allowedOrigins.includes(normalized));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ ok: true, message: "Mood journal API" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/entries/ai-status", (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) });
});

// Use app["delete"] so "delete" is never a bare identifier (avoids reserved-word/minification edge cases)
app["delete"]("/entries/:id", deleteEntryHandler);

app.use("/entries", entriesRouter);

/** 404 when no route matched – log so we can see what Express actually received */
app.use((req, res, next) => {
  console.log("404 – no route matched:", req.method, req.path, "url:", req.url, "originalUrl:", req.originalUrl);
  res.status(404).json({ error: "Not found", method: req.method, path: req.path });
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
  console.log(`Server listening on http://localhost:${PORT}`);
});
