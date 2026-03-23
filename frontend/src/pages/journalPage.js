import { getEntries as apiGetEntries, createEntry, deleteEntry, getMeRequest } from "../api.js";
import { getAccessToken, getCachedUser, setSession } from "../authSession.js";
import { applyThemeForUser } from "../theme.js";
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
} from "../state.js";
import {
  setUiScope,
  clearUiScope,
  getFormElements,
  setLoading as uiSetLoading,
  showError,
  clearError,
  showToast,
  renderCurrentResponse,
  renderHistory,
  autoResizeTextarea,
} from "../ui.js";

const JOURNAL_INNER_HTML = `
<div class="app-main journal-page">
  <header class="journal-page-header" aria-label="Journal">
    <h1 class="journal-page-title">Journal</h1>
    <p id="journal-user-display" class="journal-page-user" aria-live="polite"></p>
  </header>
  <section class="journal-section" aria-label="New journal entry">
    <form id="journal-form" class="journal-form">
      <label for="journal-input" class="journal-label">What's on your mind today?</label>
      <textarea id="journal-input" name="journal-input" class="journal-input" rows="4" autocomplete="off"
        placeholder="Write freely about your thoughts, feelings, or mood..."></textarea>
      <div class="journal-actions">
        <div class="journal-meta">
          <span class="shortcut-hint">Ctrl/Cmd + Enter to submit</span>
          <span id="loading" class="loading-indicator" aria-live="polite" hidden>Claude is thinking...</span>
        </div>
        <button id="submit-btn" type="submit" class="primary-button">Get Reflection</button>
      </div>
    </form>
    <div id="error" class="error-banner" role="alert" aria-live="assertive" hidden></div>
  </section>
  <section id="ai-response-section" class="response-section" aria-label="AI response">
    <h2 class="section-title">Latest reflection</h2>
    <div id="ai-response" class="response-card response-empty">Your reflection with Claude will appear here.</div>
  </section>
  <section class="history-section" aria-label="Journal history">
    <div class="history-header"><h2 class="section-title">History</h2></div>
    <div id="history" class="history-container">
      <div id="history-list" class="history-list"></div>
    </div>
  </section>
</div>
`;

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

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountJournalPage(root) {
  root.innerHTML = JOURNAL_INNER_HTML;
  setUiScope(root);

  setEntries([]);
  setError(null);
  setCurrentResponse(null);
  setClaudeLoading(false);

  const { textarea, form } = getFormElements();
  if (!textarea || !form) {
    clearUiScope();
    return () => {};
  }

  let disposed = false;

  const onSubmit = async (event) => {
    event.preventDefault();
    await handleSubmit(textarea);
  };

  const onInput = () => autoResizeTextarea();
  const onKeydown = (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  };

  form.addEventListener("submit", onSubmit);
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("keydown", onKeydown);
  autoResizeTextarea();

  const userDisplayEl = root.querySelector("#journal-user-display");
  if (userDisplayEl) {
    const cached = getCachedUser();
    const cachedName = typeof cached?.name === "string" ? cached.name.trim() : "";
    userDisplayEl.textContent = cachedName ? `Signed in as ${cachedName}` : "Loading profile…";
  }

  loadUserDisplay().catch(() => {});
  loadInitialHistory().catch(() => {});

  async function loadUserDisplay() {
    if (!userDisplayEl || disposed) return;
    try {
      const data = await getMeRequest();
      if (disposed) return;
      const token = getAccessToken();
      if (data?.user && token) {
        setSession(token, data.user);
      } else {
        applyThemeForUser(data?.user ?? null);
      }
      const name = typeof data?.user?.name === "string" ? data.user.name.trim() : "";
      userDisplayEl.textContent = name ? `Signed in as ${name}` : "Signed in";
    } catch {
      if (disposed || !userDisplayEl) return;
      const fallback = getCachedUser();
      const n = typeof fallback?.name === "string" ? fallback.name.trim() : "";
      userDisplayEl.textContent = n ? `Signed in as ${n}` : "Your journal";
    }
  }

  function setClaudeLoading(isLoading) {
    setLoading(isLoading);
    uiSetLoading(isLoading);
  }

  async function loadInitialHistory() {
    if (getLoading() || disposed) return;

    setClaudeLoading(true);
    clearError();

    try {
      const entries = await apiGetEntries();
      if (disposed) return;
      setEntries(entries);
      renderHistory(getEntries(), (id) => handleDeleteEntry(id));

      const first = getEntries()[0];
      if (first && first.aiResponse) {
        setCurrentResponse(first.aiResponse);
        renderCurrentResponse(getCurrentResponse());
      }
    } catch (err) {
      if (disposed) return;
      setError(err?.message || "Could not load your previous entries.");
      showError(getError());
    } finally {
      if (!disposed) setClaudeLoading(false);
    }
  }

  async function handleSubmit(textareaEl) {
    if (getLoading() || disposed) return;

    const raw = textareaEl.value ?? "";
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
      if (disposed) return;

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

      textareaEl.value = "";
      autoResizeTextarea();
      textareaEl.focus();
    } catch (err) {
      if (disposed) return;
      // eslint-disable-next-line no-console
      console.error("[ui] Failed to submit journal entry", err);
      setError(err?.message || "Something went wrong while saving your entry.");
      showError(getError());
    } finally {
      if (!disposed) setClaudeLoading(false);
    }
  }

  async function handleDeleteEntry(id) {
    if (getLoading() || disposed) return;
    const entriesBefore = getEntries();
    const wasFirst = entriesBefore.length > 0 && entriesBefore[0].id === id;

    try {
      await deleteEntry(id);
      if (disposed) return;
      removeEntryById(id);
      showToast("Entry deleted");
      if (wasFirst) {
        const next = getEntries()[0];
        setCurrentResponse(next ? (next.aiResponse ?? "") : "");
        renderCurrentResponse(getCurrentResponse());
      }
      renderHistory(getEntries(), (entryId) => handleDeleteEntry(entryId));
    } catch (err) {
      if (disposed) return;
      setError(err?.message || "Could not delete entry.");
      showError(getError());
    }
  }

  return () => {
    disposed = true;
    form.removeEventListener("submit", onSubmit);
    textarea.removeEventListener("input", onInput);
    textarea.removeEventListener("keydown", onKeydown);
    clearUiScope();
    root.innerHTML = "";
  };
}
