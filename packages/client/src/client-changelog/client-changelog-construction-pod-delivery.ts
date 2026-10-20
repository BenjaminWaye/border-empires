import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CONSTRUCTION_POD_DELIVERY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792513117000, // Date.now() captured once for this release.
    introducedIn: "2026.10.20.2",
    title: "Parts deliveries from your AFC are now a proper show",
    why: "The parts pod that carries each build phase's materials from your AFC was a small glowing box on a plain arc, and the new crates appeared before it had even landed.",
    changes: [
      "Your AFC now prints the parts pod inside its glass chamber and fires it out of its crown with a flash and a shockwave",
      "The pod flies like a cargo lander: it leans into the trip, flares to brake, trails exhaust and casts a shadow",
      "It burns down onto the site, kicking up dust and sparks, then folds open to leave the new crates behind",
      "A site's parts stack now stays empty until its pod has landed",
      "This animation is in the 3D map only; the 2D map shows construction sites as before"
    ]
  }
];
