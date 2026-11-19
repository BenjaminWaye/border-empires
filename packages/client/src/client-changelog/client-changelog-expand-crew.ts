import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPAND_CREW_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Ancillaries walk out to claim new frontier",
  why: "Expanding onto a neutral tile only showed a coloured fill sliding in, so the most common action in the game was also the least visible one.",
  changes: [
    "When you expand, a few ancillaries walk out of the tile you're expanding from, spread across the new tile and stake it. The new frontier then grows outward from where they stand",
    "As the claim completes they settle into the ground and become part of the frontier, rather than just vanishing",
    "Muster flags sending out expands get a smaller crew of two, so a busy flag stays readable",
    "Shown on both the 3D and 2D maps. With reduced motion turned on, or on a device the game finds too slow, the crew stands on the tile without walking"
  ]
};
