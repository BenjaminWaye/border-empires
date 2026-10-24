import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_STOP_SHORT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792756878878, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Marches into the unknown stop short instead of failing",
    why: "A march toward an unexplored tile that turned out to be water or a mountain was refused with an error, even though you had no way of knowing what was there.",
    changes: [
      "March To accepts any tile, whatever its terrain, with no error",
      "If the target turns out to be a mountain, sea or an isle you can't reach, the flag gets as close as it can and quietly switches back to Hold"
    ]
  }
];
