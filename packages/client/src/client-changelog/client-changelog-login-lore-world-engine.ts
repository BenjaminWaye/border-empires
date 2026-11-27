import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOGIN_LORE_WORLD_ENGINE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Loading quotes match the new lore",
  why: "Three loading-screen quotes described Bleed infestations and a frontier that pushes back, which the setting no longer has.",
  changes: [
    "The Wardens quote now says they burned away the Bleed before turning on their makers",
    "A new frontier saying replaces the one about the frontier pushing back",
    "The Crystal saying now says refining puts aether back to work"
  ]
};
