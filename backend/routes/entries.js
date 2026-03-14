import { Router } from "express";
import { prisma } from "../lib/db.js";
import { getJournalingResponse } from "../lib/ai.js";

export const entriesRouter = Router();

/** GET /entries - list all journal entries, newest first */
entriesRouter.get("/", async (req, res, next) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

/** POST /entries - create entry with mood, call Claude, save and return */
entriesRouter.post("/", async (req, res, next) => {
  try {
    console.log("[entries] POST /entries received, body keys:", Object.keys(req.body || {}));
    const mood = req.body?.mood;
    if (typeof mood !== "string" || !mood.trim()) {
      const err = new Error("mood is required and must be a non-empty string");
      err.statusCode = 400;
      return next(err);
    }

    console.log("[entries] calling getJournalingResponse...");
    const { text: aiText, errorCode: aiErrorCode } = await getJournalingResponse(mood.trim());
    console.log("[entries] getJournalingResponse:", aiText ? `length ${aiText.length}` : aiErrorCode ?? "null");

    const entry = await prisma.journalEntry.create({
      data: {
        mood: mood.trim(),
        aiResponse: aiText ?? undefined,
      },
    });

    const payload = { ...entry };
    if (aiErrorCode) payload.aiError = aiErrorCode;
    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
});
