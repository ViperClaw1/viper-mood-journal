const state = {
  entries: [],
  loading: false,
  error: null,
  currentResponse: null,
};

export function getEntries() {
  return state.entries;
}

export function setEntries(entries) {
  state.entries = Array.isArray(entries) ? entries : [];
}

export function prependEntry(entry) {
  state.entries = [entry, ...state.entries];
}

export function getLoading() {
  return state.loading;
}

export function setLoading(isLoading) {
  state.loading = Boolean(isLoading);
}

export function getError() {
  return state.error;
}

export function setError(message) {
  state.error = message ?? null;
}

export function getCurrentResponse() {
  return state.currentResponse;
}

export function setCurrentResponse(response) {
  state.currentResponse = response ?? null;
}

export default state;

