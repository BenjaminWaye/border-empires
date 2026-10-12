import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MOBILE_LOADING_FIT_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1791810643105, // Date.now() frozen for this entry.
  introducedIn: "2026.10.12.1",
  title: "Loading screen fits on phones",
  why: "The loading card could extend beyond the edge of a narrow phone screen.",
  changes: ["The loading card and its messages now fit within the screen, with scrolling available on short screens."]
}];
