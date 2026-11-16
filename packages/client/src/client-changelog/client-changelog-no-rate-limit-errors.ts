import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NO_RATE_LIMIT_ERRORS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "No more \"command rate limit\" errors",
  why: "Garrisoning many tiles at once (33 in Garrison Many) popped an \"Action failed — COMMAND_RATE_LIMITED\" error, and some of those orders were lost.",
  changes: [
    "Big batches of orders are now sent at the pace the server accepts instead of all at once, so they aren't refused",
    "If the server still asks the game to slow down (for example with the game open in two tabs), it waits and re-sends the order instead of showing you an error"
  ]
};
