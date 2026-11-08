import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SPACE_BASES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794139119002, // Date.now() captured once for this entry.
    introducedIn: "2026.11.08",
    title: "Space: bases on bodies, and smoke where a planet was hit",
    why: "Growing a system needed a visible first step, and the map did not show what had just happened where.",
    changes: [
      "Before you can develop a gas giant, belt or ice moon you establish a base on it: one order, 8 hours at an Industrial world",
      "A planet that a raid or Warden got through on smokes for a day, for everyone to see, on the 3D galaxy and the 2D strategic map",
      "Your systems show a gold ring while they build and a small Probe circling systems you are watching",
      "Inside a system, each body shows its base, its development and any build in progress, in 3D and in a strip above your cards"
    ]
  }
];
