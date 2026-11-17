import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_LOADING_STUCK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Chronicle no longer stuck on Loading",
  why: "If your connection blipped while Chronicle → Yours was fetching, the tab could show Loading… for the rest of the session, and only a page reload brought it back.",
  changes: [
    "A Yours or World request that gets no answer now gives up after a few seconds and says so, instead of loading forever.",
    "Tapping the tab again retries straight away, including after a reconnect."
  ]
};
