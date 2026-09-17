import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_63: ClientChangelogEntry[] = [
  {
    createdAt: 1789375785268, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "New world feature: Waystations",
    why: "The map's only scouting site was the Watchtower, a one-shot temporary vision pulse. Waystations add a denser (~1 per 400 tiles), permanent frontier outpost: activating one is a real, lasting reward for pushing your border out rather than a brief flicker.",
    changes: [
      "New world-generated Waystation sites, roughly 1 per 400 tiles -- noticeably more common than Watchtowers. Expanding onto one activates it, permanently: it reveals the surrounding map, gives your nearest town a population burst, grants a tech outright, and adds a slot to your empire's pooled resource supply -- all four effects fire once and never expire"
    ]
  }
];
