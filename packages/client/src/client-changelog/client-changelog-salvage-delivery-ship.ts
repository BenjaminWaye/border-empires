import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SALVAGE_DELIVERY_SHIP_ENTRY: ClientChangelogEntry = {
  createdAt: 1795035588869, // Date.now() captured once for this entry.
  introducedIn: "2026.11.18",
  title: "Watch the Court's Ancillaries arrive",
  why: "Shipping salvage to the Court paid out manpower with nothing to see on the map.",
  changes: [
    "When you ship salvage to the Court, an Imperial dropship dives in through a fiery re-entry and settles on its thrusters over your Reclamation Works",
    "Its ramp runs out and your new Ancillaries, as soldiers in your colour, march off across your land and disappear into your territory",
    "The ship then lifts back off to orbit; shown in both the 2D and 3D maps"
  ]
};
