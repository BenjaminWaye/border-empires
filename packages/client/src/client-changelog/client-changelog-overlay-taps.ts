import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OVERLAY_TAPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Fewer taps lost to closing cards and the guide button",
  why: "A result card like Territory Claimed could close itself just as you tapped its ✕, sending the tap to the map. The minimised guide's ? button sat on Back buttons and headings in panels and screens.",
  changes: [
    "A tap where a result card was, right after it closes on its own, no longer selects the map underneath.",
    "The minimised guide's ? button stays on the map and no longer covers panels or screens."
  ]
};
