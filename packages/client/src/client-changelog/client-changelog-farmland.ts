import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_FARMLAND: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799383,
    introducedIn: "2026.09.24.2",
    title: "Farms have a new look",
    why: "Farm tiles were drawn as a procedural barley field. They now use a modelled farm tile with crop rows, a silo and a hay bale that is easier to read at a glance.",
    changes: [
      "Every farm resource tile in the 3D map now shows a low-poly farm with golden crop rows, a silo and a hay bale",
      "Each farm is turned a random 90 degrees so neighbouring farms do not look copy-pasted",
      "The 2D fallback renderer is unchanged"
    ]
  }
];
