import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOADING_QUOTE_EVERYWHERE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Lore quotes for the whole load",
  why: "The quote only appeared on the small card at the very end of loading, so most players never saw it.",
  changes: [
    "The \"Securing session\" card now shows a lore quote while you sign in and the world loads",
    "The same quote stays up for the whole load, including when loading is slow"
  ]
};
