import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_RADAR_RING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Scout drone radar ring fixed",
  why: "The ring under a scout drone was cut off by hills and coastlines, and its radar line could freeze in place.",
  changes: [
    "The scout drone's vision ring shows in full over hills, trees and coastlines",
    "The radar line keeps sweeping. Reduce Motion still holds it still"
  ]
};
