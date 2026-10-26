import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESOURCE_NETWORKS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1792964349249, // Date.now() captured once.
  introducedIn: "2026.10.25.1",
  title: "Develop your land into an industrial heartland",
  why: "A resource-rich island should support a stronger campaign economy when you invest in it.",
  changes: [
    "New standard maps target 1,000 tiles each of neural resin, conductive minerals, catalysts, luxury biota and precursor salvage, grouped into deposits of 1–3 tiles in suitable biomes.",
    "Explore deposits and develop them with the matching industry. Implant Foundry unlocks alongside Ancillary Depot; Reclamation Works unlocks alongside Manufactory.",
    "Developed resin and conductive sites increase Ancillary Factory batches; towns still supply the bodies and depots determine storage.",
    "Catalysts and luxury exports back more Coin credit through Trade Nexuses; reclaimed machinery improves Manufactory-backed credit.",
    "Each developed site supplies one building: resin grants +12 Ancillaries per batch, conductive minerals +6, and credit resources +1.5 Coin/day. Extra buildings need additional supply slots.",
    "Conductive deposits expose branching metal seams in fractured rock; the Implant Foundry uses matching ore art in both map renderers.",
    "Deposits and extraction buildings have art in both the 2D and 3D maps. Decorative lone trees are removed; resin appears as distinct groves. Saved campaigns keep their existing deposits."
  ]
}];
