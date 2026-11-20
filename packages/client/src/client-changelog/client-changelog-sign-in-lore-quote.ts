import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIGN_IN_LORE_QUOTE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Lore quotes on the sign-in screen",
  why: "Lore quotes only appeared when reconnecting mid-game, never while logging in.",
  changes: ["The sign-in loading card now shows a lore quote while your empire connects"]
};
