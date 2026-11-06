import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NAME_DECAL_HILLS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793954328000, // Date.now() captured once for this entry.
    introducedIn: "2026.11.6.1",
    title: "Landmass names show over hills",
    why: "On the 3D map, the hill terrain covered the lettering where a landmass or empire name crossed it.",
    changes: ["On the 3D map, names painted on the ground now follow the hills, so they stay readable across them"]
  }
];
