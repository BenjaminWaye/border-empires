import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESOURCE_NETWORKS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1792964349249, // Date.now() captured once.
  introducedIn: "2026.10.25.1",
  title: "Develop your land into an industrial heartland",
  why: "A resource-rich island should support a stronger campaign economy when you invest in it.",
  changes: [
    "New maps contain neural resin, conductive minerals, catalysts, luxury biota and precursor salvage.",
    "Explore deposits, commission their specialised Manifest, and build the matching extraction installation.",
    "Developed resin and conductive sites increase Ancillary Factory batches; towns still supply the bodies and depots determine storage.",
    "Catalysts and luxury exports back more Coin credit through Trade Nexuses; reclaimed machinery improves Manufactory-backed credit.",
    "The first three sites of each resource give full bonuses, the next three half bonuses, with no extra bonus beyond six.",
    "Deposits and extraction buildings have art in both the 2D and 3D maps. Existing campaign geography is unchanged."
  ]
}];
