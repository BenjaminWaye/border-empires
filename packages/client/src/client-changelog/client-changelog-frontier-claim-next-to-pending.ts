import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_CLAIM_NEXT_TO_PENDING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Claim land next to tiles you're still claiming",
  why: "Claiming a tile that only bordered land you were still claiming was refused with a message saying you needed more coin, even though frontier claims cost no coin.",
  changes: [
    "You can now queue a claim on land that borders tiles you're still claiming. It goes ahead once the earlier claim lands.",
    "When a claim is held back, the message now gives the real reason (settlers already on the way, regrouping after a failed attempt, or land beyond your borders) and no longer mentions coin."
  ]
};
