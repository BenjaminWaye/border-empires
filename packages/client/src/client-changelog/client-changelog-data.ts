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
import { CLIENT_CHANGELOG_ENTRIES_2D_SETTLE_DOTS } from "./client-changelog-2d-settle-dots.js";
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
    createdAt: 1791311818491, // Date.now() frozen for this entry
    introducedIn: "2026.10.06.1",
    title: "Relay Beacons and forts are built piece by piece",
    why: "A Relay Beacon or fort under construction looked the same as a finished one, so a multi-hour build gave no sign of progress.",
    changes: [
      "A Relay Beacon being built now grows in four phases in both the 3D and 2D maps (with scaffolding around it in 3D): the legs and column rise, and the mirror array is fitted last",
      "Forts, Palisades and Bastions being built rise wall by wall in four phases, with a crew working inside the walls (and scaffolding in 3D); removing one plays it in reverse",
      "Upgrading a fort keeps the standing fort fully drawn, since it keeps defending, and shows the crew and scaffolding working around it",
      "Tall structures, such as towers, now rise gradually through the build phases instead of showing at full height straight away",
      "Construction crews are now the same small black dots as when settling, and stop where they stand while a build is paused; a stack of glowing fabricated parts sits at the site",
      "At the start of every phase a pod of freshly fabricated parts now flies in from your Automated Fabrication Complex, instead of dropping from orbit; the farther the site is from it, the longer the flight",
      "The first five Relay Beacons are still placed instantly, so only later, slower builds show the animation"
    ]
  },
  {
    createdAt: 1791315189192, // Date.now() frozen for this entry
    introducedIn: "2026.10.06.1",
    title: "AI stops building redundant coastal relays",
    why: "Existing relay coverage hid known water from the AI’s ocean filter, so it mistook offshore fog for new land.",
    changes: ["AI relay placement now recognizes ocean inside existing reach while preserving exploration toward unseen land"]
  },
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
    createdAt: 1791228193000, // frozen Date.now() value for this release
    introducedIn: "2026.10.05.3",
    title: "A new season no longer leaves the old one on screen",
    why: "If the game was open when a new season started, it kept showing the last season's leaderboard, victory standings and map until you reloaded the page.",
    changes: [
      "When a new season starts, an open game reconnects on its own and loads the new season",
      "The leaderboard, victory standings, map and camera from the old season are cleared"
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
  {
    createdAt: 1791196969000, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.4",
    title: "Attacks now pause settling and building",
    why: "A tile could finish settling or construction while an attack on it was already under way, so the battle was fought against a tile that had changed since it was launched.",
    changes: [
      "Attacking a tile that is being settled cancels the settle and refunds it",
      "Buildings under construction on an attacked tile pause, showing \"Paused: ongoing attack\", and resume with the same time remaining if the defender holds",
      "A tile under attack can't be settled or have a new building started until the battle resolves"
    ]
  },
  {
    createdAt: 1791317162415, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.5",
    title: "Effort levels boost your odds more gently",
    why: "Committing extra manpower used to square your odds, which made Planetary Defense raids roll at around 1% and effort feel like a coin flip between hopeless and certain.",
    changes: [
      "Extra effort now multiplies your odds ratio by 1.5 and Double by 2, so a 50% fight becomes 60% and 67%",
      "Effort never guarantees a win: the boost matters most in contested fights and barely moves hopeless ones",
      "Raids are gone: attacking Planetary Defense now works exactly like attacking a player, with the same mustered-manpower requirement and effort levels",
      "Planetary Defense attacks can no longer be launched from your general manpower pool; you need a funded muster flag nearby"
    ]
  },
  {
    createdAt: 1791324311000, // frozen Date.now() value for this release
    introducedIn: "2026.10.07.1",
    title: "Tile menu names whose reach you are inside",
    why: "A contested frontier tile just said \"Inside Enemy Reach\", which made you guess which empire was pressing on it.",
    changes: [
      "The tile menu now says \"Inside <empire> Reach\" with the empire's name, or both names when two reaches overlap",
      "Tap the line to see why: you can't settle inside another empire's reach",
      "It still says \"Inside Enemy Reach\" when the covering empire can't be seen yet (fogged anchors) or when three or more reaches overlap"
    ]
  },
  {
    createdAt: 1791401674856, // frozen Date.now() value for this release
    introducedIn: "2026.10.07.2",
    title: "Rivers look like water again",
    why: "River water was a pale see-through film drawn on top of everything, so it looked like it floated over the land, glowed through fog, and hung off the edge of explored land.",
    changes: [
      "River water is now a solid deep blue-teal with a dark wet bank along the waterline, so it sits down in the land",
      "Territory colour stops at a dark wet riverbank instead of covering or bleaching the water, in both 3D and 2D",
      "Fog now darkens rivers like the land around them",
      "At the edge of explored land you see your half of a river; no more pieces hanging into unexplored space or dry riverbeds",
      "Rivers cut down through the coast and spill out into the sea instead of stopping at a square end on the shore",
      "River mouths widen and blend into the sea instead of looking cut off at the coastline (3D and 2D)",
      "Coastlines are calmer and softer: waves settle near the shore instead of flickering the square sea edges, and a light foam line runs along every coast (3D and 2D)",
      "Rivers are a little narrower so trees and towns no longer stand in the water, and trees keep off the bank"
    ]
  },
  {
    createdAt: 1791434436666,
    introducedIn: "2026.10.08.1",
    title: "Your AFC's landing has sound",
    why: "The orbital landing of your Automated Fabrication Complex played in silence.",
    changes: [
      "A rocket roar now plays as your AFC starts its landing from orbit, in both the 3D map and the 2D fallback",
      "The landing now follows the sound: thrusters at full burn as it comes in, winding down as it slows, cutting out just above the ground, then touchdown on the impact",
      "It follows your music mute and volume settings and plays over the soundtrack without interrupting it"
    ]
  },
  {
    createdAt: 1791437889049,
    introducedIn: "2026.10.08.2",
    title: "AFC landing stays put when you pan",
    why: "Panning the 3D map while your AFC was landing from orbit made the landing slide along with your view instead of staying on its tile.",
    changes: ["Your AFC's orbital landing now stays on its tile in the 3D map while you pan the camera"]
  },
  {
    createdAt: 1791450095409,
    introducedIn: "2026.10.08.3",
    title: "Tips wait for your AFC to land",
    why: "The \"First Town Discovered!\" tooltip and the New empire checklist popped up on top of the tutorial and over your AFC's landing from orbit.",
    changes: [
      "Discovery tooltips and the New empire checklist now stay hidden while the tutorial or another dialog covers the map",
      "When you join a season they appear only once your AFC has finished landing, and nothing discovered in the meantime is lost"
    ]
  },
  {
    createdAt: 1791462529729,
    introducedIn: "2026.10.08.4",
    title: "Map effects stay put when you pan",
    why: "Panning the 3D map could leave effects such as the aegis lock field, bombardments, unsettle and the floating population-loss text offset from the tile they belong to.",
    changes: ["Effects on the 3D map now stay on their tile while you pan, including the 15-minute aegis lock field and after panning all the way around the world"]
  },
  {
    createdAt: 1791469121213,
    introducedIn: "2026.10.08.5",
    title: "New empires no longer land inside a neighbour's reach",
    why: "A new empire could land right next to another player whose reach already covered its starting land. The AFC then claimed almost nothing and could barely see past its own tile.",
    changes: [
      "New and respawning empires now land where their starting reach is clear of every other empire's reach, whenever the map has room",
      "Your AFC always sees 4 tiles around itself",
      "Even on a crowded map, a newly landed AFC always keeps the 3x3 ground it stands on"
    ]
  },
  {
    createdAt: 1791469348919,
    introducedIn: "2026.10.08.6",
    title: "Quieter AFC landing",
    why: "The rocket roar of your AFC's landing from orbit played about three times louder than the music.",
    changes: ["The landing rocket now plays at the same loudness as the soundtrack and still follows your music volume and mute settings"]
  },
  {
    createdAt: 1791527610656,
    introducedIn: "2026.10.09.1",
    title: "Storm clouds over unexplored land",
    why: "The map beyond what you've explored was a black void, which made the area around your start feel dark and empty.",
    changes: [
      "Unexplored territory is now a hatched storm-cloud bank, drawn like weather on an old map, in both the 3D map and the 2D map",
      "Unexplored tiles bordering your land give a glimpse of their terrain (ground, forests, hills and mountains) through a see-through parchment band, edged in riveted brass where the storm begins, while every tile you've explored stays completely clear",
      "Land you've explored but can't currently see now looks like a pale, faded survey print, keeping its forests and mountains, instead of turning near-black",
      "The clouds lie level with the land, and faint tile outlines show through them so you can still see the grid you haven't explored",
      "Distant terrain fades into the clouds instead of into black"
    ]
  },
  ...CLIENT_CHANGELOG_ENTRIES_2D_SETTLE_DOTS,
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
