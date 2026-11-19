import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPAND_CREW_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Ancillaries walk out to claim new frontier",
  why: "Expanding onto a neutral tile only showed a coloured fill sliding in, so the most common action in the game was also the least visible one.",
  changes: [
    "When you expand, a few ancillaries walk out of the tile you're expanding from, spread across the new tile and stake it. The new frontier then grows outward from where they stand",
    "As the claim completes they settle into the ground and become part of the frontier, rather than just vanishing",
    "Muster flags sending out expands get a smaller crew of two, so a busy flag stays readable",
    "Shown on both the 3D and 2D maps. With reduced motion turned on, the crew stands on the tile without walking; the 3D map also does this on a device it finds too slow"
  ]
};

export const EXPAND_SOLDIERS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Your soldiers now walk out to claim new frontier",
  why: "The ancillaries that walked out to claim an expanded tile were tiny dark figures that were hard to spot, and they didn't look like the soldiers who march to your attacks.",
  changes: [
    "Two of your soldiers, in your empire's colour, now walk out of the tile you expand from and idly patrol the new tile while it is claimed, the same way Planetary Defense soldiers patrol theirs",
    "They kneel to plant the claim just before it completes",
    "Muster flag expands send the same pair",
    "On the 2D map they appear as the same soldier figures Planetary Defense tiles use, in your colour"
  ]
};
