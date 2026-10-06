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
const ALL_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1791208703442, // Date.now() frozen for this entry
    introducedIn: "2026.10.05.3",
    title: "Border Empires icon now appears everywhere",
    why: "Some browsers and search results used an old fallback icon instead of the Border Empires castle.",
    changes: [
      "The fallback browser icon now uses the Border Empires castle, matching the primary icon"
    ]
  },
  {
    createdAt: 1791195855000, // Date.now() frozen for this entry
    introducedIn: "2026.10.05.1",
    title: "Muster flags attack launch tiles",
    why: "Advance and March flags treated any tile an attack had launched from as locked, so on a busy front they reported no target even with enemies all around.",
    changes: [
      "Advance and March muster flags can now fire on the tile an enemy attack launched from",
      "A flag can launch from a tile that already launched another of your attacks; a tile that is itself under attack is still skipped"
    ]
  },
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
    createdAt: 1791002214000, // Date.now() frozen for this entry
    introducedIn: "2026.10.03.1",
    title: "Cleaner starting grounds and no trees under towns or docks",
    why: "A new empire's Automated Fabrication Complex could land on, or right next to, a town, dock or resource, and trees could be left standing on town and dock tiles.",
    changes: [
      "Your Automated Fabrication Complex now only lands where its tile and all 8 neighbouring tiles are free of towns, docks and resources, so you settle those yourself",
      "If a crowded map has no such clear spot left, your Automated Fabrication Complex still lands, crushing any unclaimed towns and resources in its 3x3 footprint (never docks or anything another House owns)",
      "Trees are now cleared from every town and dock tile"
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
  {
    createdAt: 1791166249102, // frozen Date.now() value for this release
    introducedIn: "2026.10.05.1",
    title: "Fewer unexpected game server restarts",
    why: "The game server slowly used more and more memory and ran out roughly every 18 hours, restarting for a minute or two and dropping everyone's connection.",
    changes: [
      "Fixed a memory leak in the simulation server that kept every past command and update in memory",
      "The server should now stay up much longer between restarts"
    ]
  },
  {
    createdAt: 1791140687838, // Date.now() frozen for this entry
    introducedIn: "2026.10.04.1",
    title: "New 3D models for towns and cities",
    why: "Towns, cities, great cities and metropolises now have hand-detailed steampunk models instead of the simple box buildings, so each tier reads clearly on the map.",
    changes: [
      "Town, City, Great City and Metropolis tiles in the 3D map are drawn with textured steampunk models that grow taller and busier with each tier",
      "Settlements keep their existing look; the 2D map is unchanged"
    ]
  },
  {
    createdAt: 1791195878000, // frozen Date.now() value for this release
    introducedIn: "2026.10.05.2",
    title: "Battle progress shows your chance of winning",
    why: "The battle card rarely showed odds: not for muster attacks, often not for manual ones, and never for the defender, so you couldn't tell how likely a battle was to go your way.",
    changes: [
      "The battle progress card shows the exact chance of winning, for manual and muster attacks alike",
      "Defenders now see their own chance of holding the tile when an attack is incoming",
      "The versus bar labels each side with its percentage"
    ]
  },
  {
    createdAt: 1791196969000, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.1",
    title: "Attacks now pause settling and building",
    why: "A tile could finish settling or construction while an attack on it was already under way, so the battle was fought against a tile that had changed since it was launched.",
    changes: [
      "Attacking a tile that is being settled cancels the settle and refunds it",
      "Buildings under construction on an attacked tile pause, showing \"Paused: ongoing attack\", and resume with the same time remaining if the defender holds",
      "A tile under attack can't be settled or have a new building started until the battle resolves"
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

const latestCreatedAt = Math.max(...ALL_CLIENT_CHANGELOG_ENTRIES.map((entry) => entry.createdAt));
const oldestAllowedAt = latestCreatedAt - 6 * 24 * 60 * 60 * 1000;

export const CLIENT_CHANGELOG_ENTRIES = ALL_CLIENT_CHANGELOG_ENTRIES.filter(
  (entry) => entry.createdAt >= oldestAllowedAt
);
