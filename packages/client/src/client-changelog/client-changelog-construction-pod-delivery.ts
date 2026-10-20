import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CONSTRUCTION_POD_DELIVERY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792528290695, // Date.now() captured once for this release.
    introducedIn: "2026.10.20.4",
    title: "Your AFC's courier drones now deliver building parts",
    why: "The parts for each build phase used to appear as a small glowing box on a plain arc, and the new crates showed up before it had even arrived.",
    changes: [
      "Your AFC prints a parts pod inside its glass chamber while its courier drone lowers a winch line to collect it",
      "The drone flies the pod over on its line like a cargo quadcopter, leaning into the trip while the pod swings beneath it",
      "Over the site it hovers, kicks up dust with its rotors and winches the pod down, then flies home to dock in the AFC",
      "The pod folds open to leave the new crates, and a site's parts stack now stays empty until its pod has been set down",
      "This animation is in the 3D map only; the 2D map shows construction sites as before"
    ]
  }
];
