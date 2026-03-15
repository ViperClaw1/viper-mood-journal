import "./style.css";
import { getEntries as apiGetEntries, createEntry, deleteEntry } from "./api.js";
import {
  getEntries,
  setEntries,
  prependEntry,
  removeEntryById,
  getLoading,
  setLoading,
  getError,
  setError,
  getCurrentResponse,
  setCurrentResponse,
} from "./state.js";
import {
  getFormElements,
  setLoading as uiSetLoading,
  showError,
  clearError,
  showToast,
  renderCurrentResponse,
  renderHistory,
  autoResizeTextarea,
} from "./ui.js";

function aiErrorToMessage(code) {
  const messages = {
    key_missing:
      "Claude couldn't respond: API key is not set on the server. Add ANTHROPIC_API_KEY in Railway → backend → Variables, then redeploy.",
    http_error: "Claude API returned an error. Check your API key and model name in Railway logs.",
    empty_response: "Claude returned no text. Check Railway backend logs for details.",
    network_error: "Could not reach Claude (network or timeout). Check Railway logs.",
  };
  return messages[code] ?? `Claude couldn't respond (${code}). Check Railway backend logs.`;
}

async function bootstrap() {
  const { textarea, form } = getFormElements();

  if (!textarea || !form) {
    // Hard failure: required elements are missing
    // eslint-disable-next-line no-console
    console.error("Journal form elements not found in DOM.");
    return;
  }

  // Ensure loading indicator is hidden on first load
  setClaudeLoading(false);

  attachEventListeners(form, textarea);
  autoResizeTextarea();

  await loadInitialHistory();
}

function attachEventListeners(form, textarea) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit(textarea);
  });

  textarea.addEventListener("input", () => {
    autoResizeTextarea();
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
}

function setClaudeLoading(isLoading) {
  setLoading(isLoading);
  uiSetLoading(isLoading);
  // eslint-disable-next-line no-console
  console.debug("[loading] Claude loading:", isLoading);
}

async function loadInitialHistory() {
  if (getLoading()) return;

  setClaudeLoading(true);  // ← was setLoading(true)
  clearError();

  try {
    const entries = await apiGetEntries();
    setEntries(entries);
    renderHistory(getEntries(), (id) => handleDeleteEntry(id));

    const first = getEntries()[0];
    if (first && first.aiResponse) {
      setCurrentResponse(first.aiResponse);
      renderCurrentResponse(getCurrentResponse());
    }
  } catch (err) {
    setError(err?.message || "Could not load your previous entries.");
    showError(getError());
  } finally {
    setClaudeLoading(false);  // ← was setLoading(false)
  }
}

async function handleSubmit(textarea) {
  if (getLoading()) return;

  const raw = textarea.value ?? "";
  const trimmed = raw.trim();

  if (!trimmed) {
    setError("Please write something before submitting.");
    showError(getError());
    return;
  }

  setClaudeLoading(true);
  clearError();

  try {
    const entry = await createEntry(trimmed);

    prependEntry(entry);
    if (entry.aiError) {
      const msg = aiErrorToMessage(entry.aiError);
      setCurrentResponse(msg);
      setError(msg);
      showError(msg);
    } else {
      setCurrentResponse(entry.aiResponse ?? "");
      clearError();
    }

    renderCurrentResponse(getCurrentResponse());
    renderHistory(getEntries(), (id) => handleDeleteEntry(id));

    textarea.value = "";
    autoResizeTextarea();
    textarea.focus();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ui] Failed to submit journal entry", err);
    setError(err?.message || "Something went wrong while saving your entry.");
    showError(getError());
  } finally {
    setClaudeLoading(false);
  }
}

async function handleDeleteEntry(id) {
  if (getLoading()) return;
  const entriesBefore = getEntries();
  const wasFirst = entriesBefore.length > 0 && entriesBefore[0].id === id;

  try {
    await deleteEntry(id);
    removeEntryById(id);
    showToast("Entry deleted");
    if (wasFirst) {
      const next = getEntries()[0];
      setCurrentResponse(next ? (next.aiResponse ?? "") : "");
      renderCurrentResponse(getCurrentResponse());
    }
    renderHistory(getEntries(), (entryId) => handleDeleteEntry(entryId));
  } catch (err) {
    setError(err?.message || "Could not delete entry.");
    showError(getError());
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to bootstrap app", err);
});

