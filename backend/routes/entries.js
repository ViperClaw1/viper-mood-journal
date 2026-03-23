import { Router } from "express";
import { prisma } from "../lib/db.js";
import { getJournalingResponse } from "../lib/ai.js";

export const entriesRouter = Router();

/** GET /entries - list current user's journal entries, newest first */
entriesRouter.get("/", async (req, res, next) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { userId: req.user.id },
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
        userId: req.user.id,
      },
    });

    const payload = { ...entry };
    if (aiErrorCode) payload.aiError = aiErrorCode;
    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
});

/** DELETE /entries/:id - delete one journal entry (owner only) */
export async function deleteEntryHandler(req, res, next) {
  console.log("[entries] DELETE /entries/:id hit, id =", req.params.id);
  try {
    const id = req.params.id;
    if (!id || !String(id).trim()) {
      const err = new Error("Entry id is required");
      err.statusCode = 400;
      return next(err);
    }

    const result = await prisma.journalEntry.deleteMany({
      where: { id: id.trim(), userId: req.user.id },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Use bracket notation so "delete" is never a bare identifier (avoids any tooling/reserved-word edge cases)
entriesRouter["delete"]("/:id", deleteEntryHandler);
