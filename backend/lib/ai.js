const JOURNALING_SYSTEM_PROMPT = `You are a supportive journaling companion. The user shares how they feel (e.g. a mood or short reflection). Respond briefly with warmth and encouragement. Reflect their feeling back gently and offer a short, thoughtful perspective—no advice unless they ask. Keep responses to 2–4 sentences. Do not give medical or diagnostic language.`;

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 512;
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Calls Claude via direct HTTP.
 * @param {string} mood - User's mood/entry text
 * @returns {Promise<{ text: string|null, errorCode?: string }>} errorCode: key_missing | http_error | empty_response | network_error
 */
export async function getJournalingResponse(mood) {
  console.log("[ai] getJournalingResponse called, mood length:", mood?.length ?? 0);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    console.warn("[ai] ANTHROPIC_API_KEY is missing or empty");
    return { text: null, errorCode: "key_missing" };
  }
  console.log("[ai] calling Anthropic API...");

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: JOURNALING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Today I feel: ${mood}` }],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
    clearTimeout(timeoutId);

    const raw = await res.text();
    if (!res.ok) {
      console.error("[ai] Claude API HTTP error", res.status, raw.slice(0, 500));
      return { text: null, errorCode: "http_error" };
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error("[ai] Claude API invalid JSON response", raw.slice(0, 300));
      return { text: null, errorCode: "http_error" };
    }

    const content = Array.isArray(data.content) ? data.content : [];
    console.log("[ai] content blocks", content.length, content.map((b) => b?.type ?? "?").join(", "));

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
    if (!combined) {
      console.log("[ai] no text in content; sample:", JSON.stringify(content.slice(0, 2)));
      return { text: null, errorCode: "empty_response" };
    }
    return { text: combined };
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[ai] Claude API error:", err?.message ?? err, err?.cause);
    return { text: null, errorCode: "network_error" };
  }
}
