import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAIT_CONTEST_NO_STALL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Waiting for the next contest: see other sectors, get an email",
  why: "Choosing to wait for the next contest dropped you on an empty map with no word of what came next, and the game mistook it for a broken map sync.",
  changes: [
    "Wait for the next contest now shows a waiting screen instead of an empty map",
    "It lists the Sector Contests running now, with Fund a new sector where funding is available",
    "Email me when the next contest starts turns on the New Sector Contest email; guests are asked to save their empire first",
    "Land now instead takes you into the running contest after all",
    "Closing the join card no longer shows Map sync stalled"
  ]
};
