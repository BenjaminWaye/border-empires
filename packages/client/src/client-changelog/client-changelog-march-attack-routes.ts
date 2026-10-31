import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_ATTACK_ROUTES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792850714759, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.2",
    title: "March Attack picks flags that can actually reach the target",
    why: "March Attack chose flags and new-flag tiles by straight-line distance, so it could pick ground across open water with no way over. And a march to a target just across a strait whose dock was far down the coast walked to the beach and stopped.",
    changes: [
      "March Attack offers only flags and tiles with a real route to the target over land, docks and your aether bridges, shortest route first",
      "A march now follows a long detour to a distant dock instead of stalling on the shoreline",
      "Expand To & Attack is gone: strike a deep enemy tile with March Attack instead. Waypoints you already queued still run"
    ]
  }
];
