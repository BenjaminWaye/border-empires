import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const OCTOBER_STRUCTURE_ART_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1791827518951, // Date.now() captured once for this release.
    introducedIn: "2026.10.12.1",
    title: "Building machinery waits for construction to finish",
    why: "Fully visible moving parts could start running while their 3D building was still being built.",
    changes: ["Moving parts on 3D buildings stay still during construction and removal, then animate when complete"]
  },
  {
    createdAt: 1791830000000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "Farmsteads are now hydroponic farms",
    why: "The Farmstead's barn-and-silo art didn't convey the advanced farming upgrade it represents.",
    changes: ["Farmsteads now appear as a glowing hydroponic glass dome, with the matching overlay on the 2D map"]
  }
];
