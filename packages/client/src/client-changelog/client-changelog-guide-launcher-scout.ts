import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Player report 2026-11-21: during a scout drone flight the guide's "?" was off centre and tapping it did nothing.
export const GUIDE_LAUNCHER_SCOUT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "The guide's ? works during a drone flight",
  why: "While a scout drone was planning, flying or reporting, the guide folded to its ? button, but the ? sat off centre and tapping it did nothing.",
  changes: [
    "Tapping ? during a drone flight opens the guide card again; minimise it to fold it back",
    "The ? is centred in its button again",
    "The next drone flight starts with the guide folded, as before"
  ]
};
