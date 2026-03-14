import "dotenv/config";
import cors from "cors";
import express from "express";
import { entriesRouter } from "./routes/entries.js";

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
    methods: ["GET", "POST", "OPTIONS"],
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

app.use("/entries", entriesRouter);

/** Global error handler: 4-arg middleware */
app.use((err, req, res, next) => {
  const status = err.statusCode ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
