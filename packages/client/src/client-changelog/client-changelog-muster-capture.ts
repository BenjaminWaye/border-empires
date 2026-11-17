import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MUSTER_CAPTURE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Captured muster flags change hands",
  why: "Taking a tile with an enemy muster flag destroyed the troops on it without a trace: the attacker gained nothing and neither side was told how much manpower was lost.",
  changes: [
    "Taking a tile with another empire's muster flag in battle adds the flag's manpower to your pool, up to your manpower cap. That includes the defender taking back a failed attacker's launch tile.",
    "Both sides see the manpower over the tile on the map (+N for you, −N for them) and get an Activity feed entry.",
    "The Chronicle records captured and lost muster flags with the manpower that changed hands."
  ]
};
