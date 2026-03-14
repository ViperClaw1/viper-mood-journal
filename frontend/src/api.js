const PRODUCTION_API_URL = "https://viper-mood-journal-production.up.railway.app";

function getApiBase() {
  const env = import.meta.env.VITE_API_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.origin === "https://viper-mood-journal.vercel.app") {
    return PRODUCTION_API_URL;
  }
  return "/api";
}

const API_BASE = getApiBase();

async function parseErrorResponse(response) {
  let message = response.statusText || "Request failed";

  try {
    const data = await response.json();
    if (data && typeof data.error === "string" && data.error.trim()) {
      message = data.error.trim();
    }
  } catch {
    // ignore JSON parse errors, fall back to statusText
  }

  const error = new Error(message);
  error.status = response.status;
  return error;
}

export async function getEntries() {
  const res = await fetch(`${API_BASE}/entries`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

export async function createEntry(userTextRaw) {
  const mood = userTextRaw?.trim() ?? "";

  if (!mood) {
    throw new Error("Please write something before submitting.");
  }

  let res;

  try {
    // eslint-disable-next-line no-console
    console.debug("[api] POST /entries payload", { mood });
    res = await fetch(`${API_BASE}/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ mood }),
    });
  } catch (networkError) {
    // eslint-disable-next-line no-console
    console.error("[api] Network error POST /entries", networkError);
    throw new Error("Network error – could not reach the server.");
  }

  if (!res.ok) {
    const error = await parseErrorResponse(res);
    // eslint-disable-next-line no-console
    console.warn("[api] POST /entries non-OK", {
      status: res.status,
      statusText: res.statusText,
      message: error.message,
    });
    throw error;
  }

  const data = await res.json();

  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.mood !== "string" ||
    typeof data.createdAt !== "string"
  ) {
    // eslint-disable-next-line no-console
    console.error("[api] POST /entries unexpected shape", data);
    throw new Error("Unexpected response from server.");
  }

  // eslint-disable-next-line no-console
  console.debug("[api] POST /entries success", data);
  return data;
}

