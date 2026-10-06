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
    createdAt: 1791196311458, // Date.now() frozen for this entry
    introducedIn: "2026.10.05.2",
    title: "Watch structures get built",
    why: "Structures take hours to build, but a tile under construction looked the same as a finished one, so there was nothing to tell a slow build from a stuck one.",
    changes: [
      "Economic structures under construction now rise in four phases (foundation, frame, cladding, fit-out) with scaffolding around them, in both the 3D and 2D maps",
      "A stack of glowing parts sits beside each site and shrinks as the ancillary crew carries it over, and fresh parts drop in from orbit at the start of every phase",
      "The crew moves in lockstep and freezes when a build is overdue; removing a structure plays the phases in reverse",
      "In the 3D map, forts, siege camps, Aether Towers, Relay Beacons, Umbrite rigs and factories, and Caravanaries still show fully built while under construction"
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
    createdAt: 1791277545524, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.1",
    title: "Extra and Double effort now actually boost muster attacks",
    why: "Choosing Extra or Double effort for a muster flag was lost on the way to the server, so the flag attacked at Normal effort and the battle card showed Normal odds.",
    changes: [
      "A muster flag's chosen effort level is now saved and used for the attacks it launches",
      "The battle card's chance of winning reflects the effort you committed"
    ]
  },
  {
    createdAt: 1791280725000, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.2",
    title: "AFC module call-down takes a minute, missing modules restored, and an AFC button",
    why: "Your AFC could show only one module despite lots of research: modules researched before you had a Fabrication Complex, or lost when an AFC holding them was captured, never docked. The Call down action that moves modules between AFCs was also missing until your next research update after loading in, and there was no quick way to find your AFC.",
    changes: [
      "Select one of your AFCs to see a Call down row in its Actions tab for every researched module it doesn't hold",
      "A called-down module leaves its old AFC straight away and lands on the new one after 1 minute; its countdown shows in the AFC's overview and Actions",
      "Researched modules that aren't on any of your AFCs are called down to your home AFC automatically when you connect",
      "A module still in transit is lost if the AFC it's heading to is captured -- call it down again to another AFC",
      "Researching an AFC module now jumps the map to the AFC it docks on, so you see it land",
      "The Center button is now an AFC button: it jumps to your home Fabrication Complex and opens its module overview (or centers on your empire if you have no AFC)"
    ]
  },
  {
    createdAt: 1791311280000, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.3",
    title: "Territory colour shows on hills by the coast",
    why: "On the 3D map, hills next to the sea often showed no ownership colour, because the colour layer was drawn underneath the hill.",
    changes: [
      "Owned, frontier and settling hills along the coast now show their empire colour like any other tile",
      "The 2D map is unchanged"
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
