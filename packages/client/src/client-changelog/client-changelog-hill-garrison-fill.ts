import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HILL_GARRISON_FILL_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792861701223, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.1",
    title: "Garrisoning a hill tile shows its progress again",
    why: "On hills the 3D garrison fill was a flat white wash that never changed, so you couldn't tell how far along it was.",
    changes: ["On the 3D map, a hill tile being garrisoned now fills in your empire colour from west to east as it progresses, the same as flat ground"]
  }
];
