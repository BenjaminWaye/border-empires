import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROCEDURAL_TOWNS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1791836120802, // Date.now() frozen for this entry.
  introducedIn: "2026.10.12.1",
  title: "New towns on the 3D map",
  why: "Towns on the 3D map looked out of place next to the bright terrain and the AFC.",
  changes: [
    "Every town tier on the 3D map has new art: lived-in streets of sandstone, brick and plaster townhouses under copper, slate and terracotta roofs, with the same brass and glowing aether technology as your AFC rising out of them",
    "Towns grow visibly through their tiers, from a hamlet of cottages to a market town under a geared clock tower, a city round a copper-spired tower, a great city with twin skybridged towers, and a metropolis circled by a rooftop monorail round a brass-haloed megaspire, with airships overhead",
    "Neighbouring towns of the same tier now face different ways, so they no longer look like copies"
  ]
}];
