// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_7: ClientChangelogEntry[] = [
  {
    createdAt: 1788531647746,
    introducedIn: "2026.09.04.1",
    title: "3D map: a selected town's support tiles are now recessed glowing hatches instead of floating coins",
    why: "The floating gold/grey coin markers over a town's eight support tiles were a placeholder readout of whether each tile currently contributes gold. They've been replaced with the intended visualization: a recessed hatch with an ionic battery seated inside, matching the town's own art style. The battery and hatch rim now stay dark and powered-down on a tile you haven't settled yet, and light up once you settle it and it starts contributing -- the same information the coins carried, read at a glance from the tile itself instead of a coin hovering above it.",
    changes: [
      "3D map: support tiles around a selected town now show as a hatch with a battery cell that lights up once the tile is settled, replacing the old floating gold/grey coin markers"
    ]
  },
  {
    createdAt: 1788531700000,
    introducedIn: "2026.09.04.2",
    title: "2D map: a selected town's support tiles are now marked to match the 3D hatch overlay",
    why: "The 3D map's support-tile hatches had no 2D equivalent, so players on the 2D fallback renderer (older or lower-end devices) couldn't see which of a town's 8 support tiles were contributing gold at all.",
    changes: [
      "2D map: support tiles around a selected town now show a small brass-framed panel with a battery dot -- dark while unsettled, glowing amber once settled and contributing -- matching the 3D hatch overlay"
    ]
  }
];
