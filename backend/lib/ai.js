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

    const textBlock = message.content?.find((block) => block.type === "text");
    return textBlock?.text?.trim() ?? null;
  } catch {
    return null;
  }
}
