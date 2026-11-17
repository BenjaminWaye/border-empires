import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MET_EMPIRES_REMEMBERED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Met empires stay met",
  why: "After a reload, or once a truce partner's land was out of view, empires you had met went back to \"Not met yet\".",
  changes: [
    "Empires you have met this Sector Contest are remembered on this device across reloads, and are forgotten when a new contest starts."
  ]
};
