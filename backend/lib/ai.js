import Anthropic from "@anthropic-ai/sdk";

const JOURNALING_SYSTEM_PROMPT = `You are a supportive journaling companion. The user shares how they feel (e.g. a mood or short reflection). Respond briefly with warmth and encouragement. Reflect their feeling back gently and offer a short, thoughtful perspective—no advice unless they ask. Keep responses to 2–4 sentences. Do not give medical or diagnostic language.`;

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 512;

/**
 * Calls Claude with the journaling system prompt. Returns response text or null on API failure.
 * @param {string} mood - User's mood/entry text
 * @returns {Promise<string|null>}
 */
export async function getJournalingResponse(mood) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    console.warn("[ai] ANTHROPIC_API_KEY is missing or empty; skipping Claude response");
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: JOURNALING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Today I feel: ${mood}` }],
    });

    const content = Array.isArray(message?.content) ? message.content : [];
    console.log("[ai] content length", content.length, "blocks:", content.map((b) => b?.type ?? "?").join(", "));

    const parts = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const text =
        typeof block.text === "string"
          ? block.text
          : typeof block.thinking === "string"
            ? block.thinking
            : typeof block.content === "string"
              ? block.content
              : null;
      if (text?.trim()) parts.push(text.trim());
    }
    const combined = parts.join("\n").trim();
    if (!combined) console.log("[ai] no text extracted; raw content sample:", JSON.stringify(content.slice(0, 2)));
    return combined || null;
  } catch (err) {
    console.error("[ai] Claude API error:", err?.message ?? err);
    return null;
  }
}
