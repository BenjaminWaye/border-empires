import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLAIM_STRIPED_GROUND_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793132943794, // Date.now() captured once for this entry.
    introducedIn: "2026.10.28.4",
    title: "Claims show on striped ground",
    why: "On the 3D map, a frontier tile inside another empire's reach kept its stripes while it was being claimed, and they covered the colour that gradually fills the tile, so claims there looked like nothing was happening.",
    changes: ["3D map: a striped frontier tile drops its stripes and edge markings while it is being claimed, like it already drops its territory colour, so the claimant's colour visibly sweeps in"]
  }
];
