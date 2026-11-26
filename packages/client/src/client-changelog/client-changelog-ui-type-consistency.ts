import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UI_TYPE_CONSISTENCY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Buttons and checkboxes match the HUD",
  why: "Some controls used stock browser styles and fonts that didn't match the rest of the game.",
  changes: [
    "The building placement bar's Cancel and Confirm use the HUD's brass buttons",
    "Garrison now, Jump to Town and the auto-garrison Yes/No use the HUD's buttons",
    "Auto-garrison and other checkboxes are brass",
    "Buttons no longer fall back to the system font; scout drone counters use the game's number font"
  ]
};
