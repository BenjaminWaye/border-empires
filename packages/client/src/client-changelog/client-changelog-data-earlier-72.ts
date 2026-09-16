// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_72: ClientChangelogEntry[] = [
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
  },
  {
    createdAt: 1789375785267, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "Steampunk visual pass closes out the Economy, Domain, Tech Tree, Alliance, and mobile tip gaps",
    why: "A round of player feedback flagged five spots the earlier passes missed -- this pass closes them out.",
    changes: [
      "The Economy panel's resource cards, slot-source/occupant breakdown lines, and income/upkeep columns now use the brass/verdigris/ember palette instead of the old blue-gray",
      "Domain panel boxes -- the shard-network progress card, domain tier blocks, and domain choice/detail cards -- now use the brass/verdigris palette instead of the old dark-blue sci-fi box style",
      "The Tech Tree graph view -- tier headers, node cards, tech-card grid, and branch tags -- now uses the brass/parchment/verdigris palette (the tech detail modal/card was already reskinned in an earlier pass and is unchanged)",
      "The mobile bottom discovery-tip toast (the small floating \"first discovery\" card) now uses brass/parchment colors and Cinzel/Spectral fonts instead of its old amber-on-navy look",
      "The Alliance tab/panel -- request cards, accept/reject/break/cancel actions, and section chrome -- now uses the brass/verdigris (allied) and ember (break/reject) palette instead of its old plain dark GitHub-style look"
    ]
  },
  {
    createdAt: 1789375785268, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.06",
    title: "Hills and coastlines look less like a square grid",
    why: "Square-tile terrain reads as a checkerboard when hills are a single stamped dome and coastlines trace the tile lattice exactly -- this makes both read as organic, irregular ground on the 3D map.",
    changes: [
      "Hill tiles now render as a cluster of 3 small, irregularly placed low mounds instead of one perfectly centered dome, with the shape varying per hill tile",
      "Coastlines now wobble slightly off the tile grid instead of tracing a perfectly straight/right-angled shoreline -- purely visual, no change to which tiles are land vs. sea",
      "2D canvas fallback renderer is unchanged (its flat hard-edged tiles remain the simple accessibility path)"
    ]
  }
];
