import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AFC_MODULE_SLOTS: ClientChangelogEntry[] = [
  {
    createdAt: 1790718792000, // frozen at authoring time
    introducedIn: "2026.09.29.7",
    title: "Every Fabrication Complex module now docks in its own slot",
    why: "Only the first module docked into its slot: every later module was rotated around the map origin instead of its own dock, so it ended up far from your Fabrication Complex. Modules without their own 3D model also rendered nothing.",
    changes: [
      "Fixed modules after the first missing their slot -- each module now sits in its own slot on the Fabrication Complex",
      "Modules that don't have their own 3D model yet now dock as a plain generic cartridge instead of leaving their slot empty"
    ]
  }
];
