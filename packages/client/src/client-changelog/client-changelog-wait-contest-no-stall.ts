import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAIT_CONTEST_NO_STALL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Waiting for the next contest no longer shows Map sync stalled",
  why: "Choosing to wait for the next contest left you with no land, and the game mistook that for a broken map sync.",
  changes: ["After you choose Wait for the next contest or close the join card, the map stays clear and Join this Sector Contest takes you back"]
};
