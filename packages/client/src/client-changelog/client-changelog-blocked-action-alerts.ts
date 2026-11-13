import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BLOCKED_ACTION_ALERTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Blocked actions now tell you why",
  why: "Many warnings and errors, such as an ability on cooldown or a domain you can't pick yet, were only written to a hidden activity log, so the action seemed to do nothing.",
  changes: [
    "Warnings and errors now show in the alert card at the top of the screen.",
    "This covers Aether abilities, domain picks, muster flags, alliance and truce limits, march range, and profile changes.",
    "They never replace a combat result or other alert that is still showing."
  ]
};
