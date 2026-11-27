import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_PANEL_TIDY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Tidier town panel",
  why: "A big town's panel ran off the screen and could not be scrolled, and the Town focus card took up most of it.",
  changes: [
    "The town panel scrolls; its Grow button stays at the foot",
    "Town focus is one line showing the active focus; tap it to preview and confirm a change",
    "Switching every town's focus now lives only on the Towns list",
    "Build plots group by state, with a key: built, in progress, open, to garrison"
  ]
};
