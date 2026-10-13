import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROCEDURAL_TOWNS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1791836120802, // Date.now() frozen for this entry.
  introducedIn: "2026.10.12.1",
  title: "New towns on the 3D map",
  why: "Towns on the 3D map looked out of place next to the bright terrain and the AFC.",
  changes: [
    "Every town tier on the 3D map has new art: clockwork skyscrapers of grey stone banded in brass, with lamplit window strips and crowns of brass cog clocks, needle spires, glowing alien bulbs and finned crystals, ringed round an octagonal plaza",
    "Towns grow visibly through their tiers, from a few low towers round a cog lamp to a ring round a brass orrery, skybridged central towers, and a metropolis round a brass-haloed megatower crowned with an aether crystal, with airships overhead",
    "Neighbouring towns of the same tier now face different ways, so they no longer look like copies"
  ]
}];
