// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_75: ClientChangelogEntry[] = [
  {
    createdAt: 1789375785266, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.04",
    title: "Steampunk visual pass reaches the settings, debug, and remaining modal chrome",
    why: "The prior two passes covered core HUD chrome and the most-visited gameplay panels, but left settings sub-pages, debug overlays, and several standalone modals on their original dark-blue palette -- this pass is the final coverage push for the reskin.",
    changes: [
      "Settings hub navigation, page headers, and the profile-edit overlay now use the brass/parchment palette instead of cold blue-white",
      "The changelog, guide, respawn, intel, and structure-info modals, plus the on-map targeting card, mini-map/replay controls, mobile context card, and shard alert popup now use the brass/verdigris palette",
      "The debug/diagnostics overlay, rally-link card, and the trickle-pick resource modal are reskinned to match",
      "Dev-queue \"planned\"/\"queued\" tile-progress badges now use brass (planned) and verdigris (queued) instead of the old blue/green",
      "Season lobby and muster-flags panels were already on-theme and are unchanged"
    ]
  }
];
