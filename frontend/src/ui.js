const textarea = document.querySelector("#journal-input");
const form = document.querySelector("#journal-form");
const submitButton = document.querySelector("#submit-btn");
const loadingIndicator = document.querySelector("#loading");
const errorBanner = document.querySelector("#error");
const aiResponseEl = document.querySelector("#ai-response");
const aiResponseSection = document.querySelector("#ai-response-section");
const historyContainer = document.querySelector("#history");
const historyList = document.querySelector("#history-list");

export function getFormElements() {
  return {
    textarea,
    form,
    submitButton,
  };
}

export function setLoading(isLoading) {
  if (!loadingIndicator || !submitButton) return;
  const visible = Boolean(isLoading);
  loadingIndicator.hidden = !visible;
  submitButton.disabled = visible;
}

export function showError(message) {
  if (!errorBanner) return;
  if (!message) {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
    return;
  }
  errorBanner.hidden = false;
  errorBanner.textContent = message;
}

export function clearError() {
  showError(null);
}

export function renderCurrentResponse(text) {
  if (!aiResponseEl) return;

  const content = text && text.trim() ? text.trim() : null;

  if (!content) {
    aiResponseEl.classList.add("response-empty");
    aiResponseEl.textContent = "Your reflection with Claude will appear here.";
  } else {
    aiResponseEl.classList.remove("response-empty");
    aiResponseEl.textContent = content;
  }

  if (aiResponseSection) {
    aiResponseSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

export function renderHistory(entries) {
  if (!historyList) return;

  historyList.innerHTML = "";

  if (!entries || entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No previous entries yet. Your history will appear here.";
    historyList.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const card = document.createElement("article");
    card.className = "entry-card";

    const header = document.createElement("div");
    header.className = "entry-header";

    const dateEl = document.createElement("div");
    dateEl.className = "entry-date";
    dateEl.textContent = formatDate(entry.createdAt);

    const tagEl = document.createElement("div");
    tagEl.className = "entry-tag";
    tagEl.textContent = "Journal";

    header.appendChild(dateEl);
    header.appendChild(tagEl);

    const userBlock = document.createElement("div");
    userBlock.className = "entry-user-text";

    const userLabel = document.createElement("div");
    userLabel.className = "entry-user-label";
    userLabel.textContent = "You";

    const userBody = document.createElement("div");
    userBody.className = "entry-user-body";
    userBody.textContent = entry.mood ?? "";

    userBlock.appendChild(userLabel);
    userBlock.appendChild(userBody);

    const aiBlock = document.createElement("div");

    const aiLabel = document.createElement("div");
    aiLabel.className = "entry-ai-label";
    aiLabel.textContent = "Claude";

    const aiBody = document.createElement("div");
    aiBody.className = "entry-ai-body";
    aiBody.textContent = (entry.aiResponse ?? "").trim() || "No response recorded.";

    aiBlock.appendChild(aiLabel);
    aiBlock.appendChild(aiBody);

    card.appendChild(header);
    card.appendChild(userBlock);
    card.appendChild(aiBlock);

    historyList.appendChild(card);
  }

  if (historyContainer && historyContainer.firstElementChild) {
    historyContainer.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }
}

export function autoResizeTextarea() {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function formatDate(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return `${date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })} \u2022 ${date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return isoString;
  }
}

