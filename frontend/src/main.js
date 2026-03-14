import "./style.css";
import { getEntries as apiGetEntries, createEntry } from "./api.js";
import {
  getEntries,
  setEntries,
  prependEntry,
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
  renderCurrentResponse,
  renderHistory,
  autoResizeTextarea,
} from "./ui.js";

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
    renderHistory(getEntries());

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
    setCurrentResponse(entry.aiResponse ?? "");

    renderCurrentResponse(getCurrentResponse());
    renderHistory(getEntries());

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

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to bootstrap app", err);
});

