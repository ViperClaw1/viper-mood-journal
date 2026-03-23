import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { Router } from "express";
import { prisma } from "../lib/db.js";
import { toPublicUser } from "../lib/userPublic.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarsDir = path.join(__dirname, "..", "uploads", "avatars");

function ensureAvatarsDir() {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

ensureAvatarsDir();

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureAvatarsDir();
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const safe = allowed.includes(ext) ? ext : ".jpg";
    cb(null, `${req.user.id}-${Date.now()}${safe}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPEG, PNG, or WebP images are allowed"));
  },
});

function avatarUploadMiddleware(req, res, next) {
  avatarUpload.single("avatar")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "Image must be at most 2 MB" });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || "Invalid upload" });
    }
    next();
  });
}

function isValidOptionalUrl(value) {
  if (value === "") return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const ALLOWED_THEMES = new Set(["LIGHT", "DARK"]);

export function createUsersRouter() {
  const r = Router();
  r.use(requireAuth);

  r.put("/me/password", async (req, res, next) => {
    try {
      const currentPassword =
        typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "currentPassword and newPassword are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "newPassword must be at least 8 characters" });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      return res.status(200).json({ message: "Password updated" });
    } catch (err) {
      return next(err);
    }
  });

  r.get("/me", async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(200).json({ user: toPublicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  r.post("/me/avatar", avatarUploadMiddleware, async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided (form field name: "avatar")' });
      }
      const configured = process.env.PUBLIC_API_URL?.replace(/\/$/, "").trim();
      const base =
        configured ||
        `${req.protocol}://${req.get("host") || `localhost:${process.env.PORT || 3000}`}`;
      const avatarUrl = `${base}/uploads/avatars/${req.file.filename}`;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarUrl },
      });
      return res.status(200).json({ user: toPublicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  r.put("/me", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const hasName = Object.prototype.hasOwnProperty.call(body, "name");
      const hasAvatar = Object.prototype.hasOwnProperty.call(body, "avatarUrl");
      const hasTheme = Object.prototype.hasOwnProperty.call(body, "theme");

      if (!hasName && !hasAvatar && !hasTheme) {
        return res.status(400).json({ error: "Provide at least one of: name, avatarUrl, theme" });
      }

      const data = {};

      if (hasName) {
        if (typeof body.name !== "string") {
          return res.status(400).json({ error: "name must be a string" });
        }
        const name = body.name.trim();
        if (!name) {
          return res.status(400).json({ error: "name cannot be empty" });
        }
        data.name = name;
      }

      if (hasAvatar) {
        if (typeof body.avatarUrl !== "string") {
          return res.status(400).json({ error: "avatarUrl must be a string" });
        }
        const avatarUrl = body.avatarUrl.trim();
        if (!isValidOptionalUrl(avatarUrl)) {
          return res.status(400).json({ error: "avatarUrl must be empty or a valid http(s) URL" });
        }
        data.avatarUrl = avatarUrl === "" ? null : avatarUrl;
      }

      if (hasTheme) {
        if (typeof body.theme !== "string") {
          return res.status(400).json({ error: "theme must be a string" });
        }
        const theme = body.theme.trim().toUpperCase();
        if (!ALLOWED_THEMES.has(theme)) {
          return res.status(400).json({ error: "theme must be LIGHT or DARK" });
        }
        data.theme = theme;
      }

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data,
      });

      return res.status(200).json({ user: toPublicUser(user) });
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ error: "User not found" });
      }
      return next(err);
    }
  });

  return r;
}
