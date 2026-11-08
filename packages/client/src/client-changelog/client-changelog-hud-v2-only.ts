import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUD_V2_ONLY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794088285000, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "The classic HUD is retired",
    why: "Every player now uses the new HUD on desktop and phones, so the old one is gone.",
    changes: [
      "The ?hud=legacy link no longer switches back to the old HUD.",
      "Imperial Ward charges show as a button under the season clock, so the Ward can be activated again."
    ]
  }
];
