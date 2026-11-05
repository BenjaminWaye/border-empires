import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_MODULE_MODELS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792783605067, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.2",
    title: "Eight more AFC modules get their own 3D models",
    why: "Eight modules had finished models but still docked on your AFC as a plain grey cartridge, so you couldn't tell them apart on the map.",
    changes: [
      "On the 3D map, these modules now dock as their own machines: Bastion Master-Die, Thunderplate Induction, Hive Mind I, Hive Mind II, Neural Assembly Core, Reserve Lattice, Ancillary Control Core and Catalyst Fabricator",
      "Counterphase Core is the only module that still docks as a plain cartridge until its model is built",
      "The 2D map is unchanged: it still shows one shared AFC symbol for every module except Industrial Tooling"
    ]
  }
];
