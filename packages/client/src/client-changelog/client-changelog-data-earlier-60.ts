// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_60: ClientChangelogEntry[] = [
  {
    createdAt: 1789249191261, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.02",
    title: "Galaxy View launcher no longer overlaps the mobile minimap",
    why: "The minimap's label always renders as a bordered/padded toolbar box (e.g. \"Minimap (12, 34)\"), not plain text, so it's taller than a first pass assumed -- the Galaxy View launcher's clearance above it was 30px short, and the launcher visibly overlapped the minimap's top edge on real devices.",
    changes: [
      "The Galaxy View launcher on mobile now clears the minimap's actual (taller) height, verified with a headless render of the real minimap markup instead of a plain-text stand-in -- no more visible overlap"
    ]
  },
  {
    createdAt: 1789249191260, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.01",
    title: "Minimap moved down to the bottom of the screen on mobile",
    why: "On mobile the minimap sat with a large fixed gap above the bottom nav bar, leaving a lot of dead map space below it and pushing the Galaxy View launcher awkwardly high (close enough to the minimap to look like it overlapped it).",
    changes: [
      "The minimap now sits right above the bottom nav bar on mobile instead of floating with a big gap underneath it, freeing up more of the screen for the map",
      "The Galaxy View launcher sits just above the minimap's new, lower position instead of needing to clear as much space"
    ]
  },
  {
    createdAt: 1789249191259, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.04",
    title: "Galaxy View button moved above the minimap on mobile",
    why: "On mobile the 🌌 Galaxy View launcher was anchored just above the bottom nav bar, which put it below/behind the minimap panel instead of clear of it.",
    changes: [
      "On mobile, the Galaxy View launcher now sits above the minimap instead of tucked in behind it near the bottom nav bar"
    ]
  }
];