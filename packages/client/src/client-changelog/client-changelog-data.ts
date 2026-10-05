// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered --
// client-changelog.ts sorts by createdAt.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry. When new entries age older ones out
// of that window, move those entries into the next
// client-changelog-data-earlier-N.ts (historical record, left unreferenced)
// and delete them here and from the per-feature files below.
import { RECENT_CLIENT_CHANGELOG_ENTRIES } from "./client-changelog-data-october.js";
import { CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS } from "./client-changelog-recent-groups.js";
import { CLIENT_CHANGELOG_ENTRIES_TERRAIN } from "./client-changelog-data-terrain.js";
import { CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD } from "./client-changelog-activity-dashboard.js";
import { CLIENT_CHANGELOG_ENTRIES_RECENT } from "./client-changelog-data-recent.js";
import { CLIENT_CHANGELOG_ENTRIES_MUSTER_SAVE_UP } from "./client-changelog-muster-save-up.js";
import { CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE } from "./client-changelog-new-player-experience.js";
import { CLIENT_CHANGELOG_ENTRIES_SEPT_24_26 } from "./client-changelog-data-sept-24-26.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1791142179429, // Date.now() frozen for this entry
    introducedIn: "2026.10.04.2",
    title: "Your reach now scouts the land it covers",
    why: "Reach could extend across neutral ground without revealing it, so losing frontier tiles could leave you unable to see territory your towns, docks and outposts still allowed you to claim.",
    changes: [
      "Every tile inside your current reach now has one tile of vision",
      "You can see one tile beyond the outer edge of that reach, even when no frontier tiles remain",
      "Frontier tiles keep their existing scouting vision"
    ]
  },
  {
    createdAt: 1791140199531, // Date.now() frozen for this entry
    introducedIn: "2026.10.04.1",
    title: "Safer spawns and full AFC reach",
    why: "New players could spawn with barbarians on their doorstep, and a barbarian-held town nearby could cut away part of the AFC's reach.",
    changes: [
      "When your AFC lands, any barbarians inside its reach are cleared away so you start on open ground",
      "Barbarian-held towns, docks and outposts no longer claim reach, so they can't take reach tiles around your AFC",
      "On a very crowded map, new spawns still prefer a site with no barbarians within a few tiles"
    ]
  },
  {
    createdAt: 1791140183000, // Date.now() frozen for this entry
    introducedIn: "2026.10.04.1",
    title: "Counter-attack the tile an attack launched from",
    why: "Locking the tile an enemy attack came from left defenders unable to answer while their frontier was being taken, and two attacks from one tile could cancel each other.",
    changes: [
      "You can attack the tile an enemy attack launched from while their attack is still pending; only the tile being attacked is locked",
      "Several attacks launched from the same tile now all resolve; previously the earlier ones could be dropped without a result",
      "If the launch tile changes hands mid-fight, the original attack still resolves, and a failed attack no longer hands a captured launch tile to the defender",
      "Barbarians leave the tile they attack from the moment their attack starts, so it can't be captured to leave them alive on your tile"
    ]
  },
  {
    createdAt: 1791142473309, // Date.now() frozen for this entry
    introducedIn: "2026.10.04.1",
    title: "More reliable new seasons",
    why: "A crowded small world could reject a new season while placing its final AI starting settlements.",
    changes: [
      "New seasons now use remaining valid land for starting settlements after preferred spacing options are exhausted"
    ]
  },
  {
    createdAt: 1791005011469, // Date.now() frozen for this entry
    introducedIn: "2026.10.03.1",
    title: "AI infrastructure and clearer tile details",
    why: "AI empires missed the AFC grant that runs on human login, and tile details omitted foreign settlement status and some battles.",
    changes: [
      "AI empires missing an AFC receive one when the server starts or a season begins; it appears in both the 3D and 2D maps",
      "Foreign tile details identify settled and frontier territory",
      "Tile details show muster battles and distinguish resolved combat animations from ongoing attacks"
    ]
  },
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...CLIENT_CHANGELOG_ENTRIES_MUSTER_SAVE_UP,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_SEPT_24_26,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS
];
