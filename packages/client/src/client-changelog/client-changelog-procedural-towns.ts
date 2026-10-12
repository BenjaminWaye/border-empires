import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROCEDURAL_TOWNS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1791836120802, // Date.now() frozen for this entry.
  introducedIn: "2026.10.12.1",
  title: "New towns on the 3D map",
  why: "Towns on the 3D map were darker and murkier than the bright terrain, forests and farms around them.",
  changes: [
    "Every town tier on the 3D map has new art in the map's own sunlit style: cream walls, terracotta and slate roofs and stone city walls, with brass clocks, copper domes and lit windows",
    "Towns grow visibly through their tiers, from a farming hamlet to a market town, a walled city, a great city and a metropolis crowned by a glowing aether spire",
    "Neighbouring towns of the same tier now face different ways, so they no longer look like copies"
  ]
}];
