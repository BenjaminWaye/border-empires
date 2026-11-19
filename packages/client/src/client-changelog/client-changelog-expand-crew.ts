import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPAND_CREW_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Your soldiers walk out to claim new frontier",
  why: "Expanding onto a neutral tile only showed a coloured fill sliding in, so the most common action in the game was also the least visible one.",
  changes: [
    "When you expand, two of your soldiers, in your empire's colour, walk out of the tile you're expanding from and idly patrol the new tile while it is claimed, the same way Planetary Defense soldiers patrol theirs",
    "The new frontier grows outward from where they arrive, and they kneel to plant the claim just before it completes",
    "Muster flag expands send the same pair",
    "On the 3D map they wear the same armour as your attacking soldiers, including the heavy armour once you own a Titanium Weapons Factory. On the 2D map they appear as the soldier figures Planetary Defense tiles use, in your colour",
    "With reduced motion turned on, the soldiers stand on the tile without walking; the 3D map also does this on a device it finds too slow"
  ]
};
