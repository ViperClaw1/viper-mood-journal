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
    const mood = req.body?.mood;
    if (typeof mood !== "string" || !mood.trim()) {
      const err = new Error("mood is required and must be a non-empty string");
      err.statusCode = 400;
      return next(err);
    }

    const aiResponse = await getJournalingResponse(mood.trim());
    console.log("[route] aiResponse result:", aiResponse);
    console.log("[route] API key loaded:", !!process.env.ANTHROPIC_API_KEY?.trim());

    const entry = await prisma.journalEntry.create({
      data: {
        mood: mood.trim(),
        aiResponse: aiResponse ?? undefined,
      },
    });

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});
