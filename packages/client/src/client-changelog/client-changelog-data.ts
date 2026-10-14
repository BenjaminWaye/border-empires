import { OCTOBER_STRUCTURE_ART_CHANGELOG } from "./client-changelog-structure-art-october.js";
import { AUTO_GARRISON_REQUEUE_CHANGELOG } from "./client-changelog-auto-garrison-requeue.js";
// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered --
// client-changelog.ts sorts by createdAt.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry. When new entries age older ones out
// of that window, move those entries into the next
// client-changelog-data-earlier-N.ts (historical record, left unreferenced)
// and delete them here and from the per-feature files below.
import { RECENT_CLIENT_CHANGELOG_ENTRIES } from "./client-changelog-data-october.js";
import { AFC_MODULE_TAB_CHANGELOG } from "./client-changelog-afc-module-tab.js";
import { RIVERS_MOUNTAINS_CHANGELOG } from "./client-changelog-rivers-mountains.js";
import { GARRISON_OUTSIDE_REACH_CHANGELOG } from "./client-changelog-garrison-outside-reach.js";
import { MANPOWER_BATCH_LABEL_CHANGELOG } from "./client-changelog-manpower-batch-label.js";
import { RESTART_TILE_STATE_CHANGELOG } from "./client-changelog-restart-tile-state.js";
import { CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS } from "./client-changelog-recent-groups.js";
import { CLIENT_CHANGELOG_ENTRIES_TERRAIN } from "./client-changelog-data-terrain.js";
import { CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD } from "./client-changelog-activity-dashboard.js";
import { CLIENT_CHANGELOG_ENTRIES_RECENT } from "./client-changelog-data-recent.js";
import { CLIENT_CHANGELOG_ENTRIES_MUSTER_SAVE_UP } from "./client-changelog-muster-save-up.js";
import { CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE } from "./client-changelog-new-player-experience.js";
import { CLIENT_CHANGELOG_ENTRIES_2D_SETTLE_DOTS } from "./client-changelog-2d-settle-dots.js";
import { CLIENT_CHANGELOG_ENTRIES_GARRISON_RENAME } from "./client-changelog-garrison-rename.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_LANDING } from "./client-changelog-afc-landing.js";
import { CLIENT_CHANGELOG_ENTRIES_SEPT_24_26 } from "./client-changelog-data-sept-24-26.js";
import { CLIENT_CHANGELOG_ENTRIES_FAST_BUILDS } from "./client-changelog-fast-builds.js";
import { CLIENT_CHANGELOG_ENTRIES_BUILD_SPEED_MENUS } from "./client-changelog-build-speed-menus.js";
import { CLIENT_CHANGELOG_ENTRIES_HINT_CENTER_BUTTON } from "./client-changelog-hint-center-button.js";
import { CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN } from "./client-changelog-alliance-tab-redesign.js";
import { CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION } from "./client-changelog-diplomacy-tile-action.js";
import { MOBILE_LOADING_FIT_CHANGELOG } from "./client-changelog-mobile-loading-fit.js";
import { CLIENT_CHANGELOG_ENTRIES_WAYSTATION_AUTO_CLAIM_ACTIVATION } from "./client-changelog-waystation-auto-claim-activation.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT } from "./client-changelog-afc-hill-cut.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const ALL_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...AUTO_GARRISON_REQUEUE_CHANGELOG,
  ...RIVERS_MOUNTAINS_CHANGELOG,
  {
    createdAt: 1791643448668, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.10.1",
    title: "Better starter sites and accurate checklist goals",
    why: "A nearby town was not always reachable, and claiming food without garrisoning it looked like progress even though it supplied no food slots.",
    changes: [
      "New worlds require 50 spaced starter sites with first food within three land steps and AFC reach, four food slots within six, and a town within eight; live joins recheck neutral routes and amenities before using those sites",
      "The existing town-first checklist still highlights town and food tiles directly in both map renderers; only garrisoned food counts as usable food slots",
      "Your AFC's reach is included in local target selection, and pending targets stop highlighting until their action resolves",
      "Upgraded towns and lightweight town data count correctly, and enemy towns are not suggested as neutral expansion goals"
    ]
  },
  {
    createdAt: 1791527749820, // frozen Date.now() value for this release
    introducedIn: "2026.10.09.1",
    title: "Manpower refills every 4 hours, shown as a gauge",
    why: "Manpower crept up a few points a minute, so \"can I afford this attack yet?\" meant watching a number tick, and a short wait for one more attack felt like a constant chore.",
    changes: [
      "Manpower is now paid out in one refill every 4 hours instead of ticking up continuously. Your total regeneration is unchanged, it just lands in chunks; each player's refill moment is staggered, so yours is not the same as everyone else's",
      "The Manpower chip is now a brass gauge: the fill shows what you can spend right now (ember when below an ordinary attack, green when full, shimmering above the cap), copper plating shows manpower already staged in muster flags, and a countdown shows when the next refill lands",
      "The Manpower panel now shows what one refill pays, when the next refill is, and how long until you are full",
      "The Development chip is now a row of gears, one per slot: busy slots spin, free slots sit still, and a full set glows copper. It takes much less room on the top bar",
      "All top-bar chips (Player, Coin, Manpower, Integrity, Development) now match the brass-and-leather style of the resource pills, and on phones Integrity and Development line up with the other chips"
    ]
  },
  {
    createdAt: 1791837136490, // Date.now() frozen for this entry
    introducedIn: "2026.10.12.1",
    title: "Soldiers now show when you attack enemy frontier land",
    why: "Launching an attack on an enemy's frontier tile showed the tile changing colour but no soldiers, so it looked like a plain expansion.",
    changes: [
      "Your soldiers now step onto the enemy frontier tile you attack and stand there until it is yours, in the 3D map (the 2D map draws no soldiers for attacks)"
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
    createdAt: 1791488967000,
    introducedIn: "2026.10.08.7",
    title: "Waystations no longer promise population without a town",
    why: "A waystation could announce +5,000 population even when you owned no town to receive it, so nothing was actually granted.",
    changes: ["If a waystation rolls its population boost and you have no town, it now pays out coin instead, and the popup says so"]
  },
  {
    createdAt: 1791832192120,
    introducedIn: "2026.10.12.2",
    title: "Storm clouds over unexplored land",
    why: "The map beyond what you've explored was a black void, which made the area around your start feel dark and empty.",
    changes: [
      "Unexplored territory is now a bank of warm iron storm clouds, lit by lantern light along the edge of your known world, in both the 3D map and the 2D map",
      "Unexplored tiles bordering your land are mostly shrouded, giving just a glimpse of their terrain up to a brass edge, while every tile you've explored stays completely clear",
      "When you explore new land the clouds roll back off it with a lantern-lit glow instead of vanishing instantly",
      "Land you've explored but can't currently see now looks like a faded survey print, keeping its forests and mountains, instead of turning near-black",
      "Faint tile outlines show through the clouds, and distant terrain fades into them instead of into black"
    ]
  },
  {
    createdAt: 1791832192121,
    introducedIn: "2026.10.12.2",
    title: "No error when pressing Esc with nothing to cancel",
    why: "Pressing Esc to close a menu, with no capture running, popped up an \"Action failed: no active capture to cancel\" warning.",
    changes: ["Pressing Esc or Cancel when nothing is in progress no longer shows an error"]
  },
  {
    createdAt: 1791839075156,
    introducedIn: "2026.10.12.3",
    title: "Smoother clouds rolling back as you explore",
    why: "When you explored new land the storm clouds snapped and restarted as the newly seen tiles arrived, and trees and hills popped up through clouds that were still parting.",
    changes: [
      "The clouds now roll back off newly explored land in one smooth, slower motion, even when the land comes into view a bit at a time or you move the camera",
      "Trees, mountains and hills appear as the clouds part over them, instead of popping up through the cloud"
    ]
  },
  {
    createdAt: 1791489815345,
    introducedIn: "2026.10.08.7",
    title: "Relay Beacon build time and rush price fixed",
    why: "The build menu said a Relay Beacon takes 1 minute when it really takes an hour, and its rush-buy button showed 0 coin.",
    changes: [
      "The build menu shows the real Relay Beacon build time: instant for your first five, 60m after that",
      "Rush-buy prices for buildings now match how much of the build is actually left, so a half-built structure costs about half"
    ]
  },
  {
    createdAt: 1791489790895, // Date.now() frozen for this entry
    introducedIn: "2026.10.08.1",
    title: "Resource Monopoly counts only settled, revealed resources",
    why: "Resource Monopoly progress was counting frontier tiles and resources you hadn't revealed yet, so it could show you holding Umbrite you didn't actually control.",
    changes: [
      "Only settled resource tiles now count toward Resource Monopoly",
      "A resource only counts once you've researched the tech that reveals it"
    ]
  },
  {
    createdAt: 1791579529000, // frozen Date.now() value for this release
    introducedIn: "2026.10.09.1",
    title: "Top ribbon hover highlight no longer blinks",
    why: "The gold hover border on the top-bar chips flickered because the bar redraws often and each redraw restarted the fade-in.",
    changes: [
      "Hovering a top-bar chip now keeps a steady highlight"
    ]
  },
  {
    createdAt: 1791581686000, // frozen Date.now() value for this release
    introducedIn: "2026.10.09.2",
    title: "Choose your effort when launching an attack",
    why: "Committing extra manpower to a fight was only possible through March To. Launch Attack always sent the minimum.",
    changes: [
      "Launch Attack on a settled enemy tile now opens the Normal / Extra / Double effort picker March To uses, with a live win chance",
      "Attacks on several tiles (box-select or Attack Connected Region) get one picker that applies to each settled target",
      "Expand To & Attack asks for an effort level too; the waypoint's final attack uses it, even while you're offline",
      "Frontier and barbarian targets still attack on the first click, since extra manpower doesn't improve odds there"
    ]
  },
  {
    createdAt: 1791831898352, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "The Ancillary Depot is now a dormant-body storehouse",
    why: "The Ancillary Depot was still borrowing the Logistics Guild's civic-hall art, so it didn't read as the AI Hive's body storehouse either on the 3D map or on the 2D map.",
    changes: [
      "Ancillary Depots now show as a circular storage drum of dormant Ancillary bodies, ringed by twelve blackened-iron storage pods with brass collars and small cyan seam lights, on the 3D map",
      "The 2D map's Ancillary Depot icon and its info-card art match the new storage-drum look",
      "The Ancillary Factory keeps its hopper-tower manufactory"
    ]
  },
  ...MANPOWER_BATCH_LABEL_CHANGELOG,
  ...RESTART_TILE_STATE_CHANGELOG,
  {
    createdAt: 1791750801000, // frozen Date.now() value for this release
    introducedIn: "2026.10.11.2",
    title: "Docks link to nearby docks, with a way to jump along their routes",
    why: "Dock routes often led to a far-away dock instead of a close one, and following a long dashed route meant a lot of scrolling while the line broke up along the way.",
    changes: [
      "From next season, each dock links to its nearest dock on another island, measured by actual sea distance",
      "A dock's tile menu now has a Connected docks row: use ◀ ▶ to jump the camera to each linked dock and Back to return",
      "The dashed dock route line no longer breaks or jumps when it wraps around the map edge or leaves the area around you"
    ]
  },
  {
    createdAt: 1791805200000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "No more floating blue slabs after a long camera jump",
    why: "After jumping the camera from your coast to an area with no explored sea, the edge of your old coastline's water stayed behind as floating blue slabs in the dark.",
    changes: ["Water edges are now cleared properly when the camera moves somewhere without explored sea"]
  },
  ...CLIENT_CHANGELOG_ENTRIES_AFC_LANDING,
  ...GARRISON_OUTSIDE_REACH_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_2D_SETTLE_DOTS,
  ...CLIENT_CHANGELOG_ENTRIES_GARRISON_RENAME,
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...CLIENT_CHANGELOG_ENTRIES_MUSTER_SAVE_UP,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_SEPT_24_26,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS,
  ...CLIENT_CHANGELOG_ENTRIES_FAST_BUILDS,
  ...CLIENT_CHANGELOG_ENTRIES_BUILD_SPEED_MENUS,
  ...CLIENT_CHANGELOG_ENTRIES_HINT_CENTER_BUTTON,
  ...CLIENT_CHANGELOG_ENTRIES_ALLIANCE_TAB_REDESIGN,
  ...CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_TILE_ACTION,
  ...MOBILE_LOADING_FIT_CHANGELOG,
  {
    createdAt: 1791920134069, // Date.now() frozen for this entry.
    introducedIn: "2026.10.13.1",
    title: "New towns on the 3D map",
    why: "Towns on the 3D map looked out of place next to the bright terrain and the AFC.",
    changes: [
      "Every town tier on the 3D map has new art: clockwork skyscrapers of glass and grey stone banded in brass, with lamplit windows and crowns of brass cog clocks, needle spires, glowing alien bulbs and finned crystals, on an octagonal base plate",
      "Towns and cities are laid out on street grids with lamplit crossings, parks and skybridges between their towers, and cities rise to a downtown of sheer glass skyscrapers",
      "Towns grow visibly through their tiers, from a few low towers round a cog lamp to a metropolis round a brass-haloed megatower crowned with an aether crystal",
      "Towns are alive: steam rises from rooftop stacks, windows flicker with lamplight, clock cogs and orreries turn, crystals spin, and airships circle the bigger cities",
      "Neighbouring towns of the same tier now face different ways, so they no longer look like copies"
    ]
  },
  ...AFC_MODULE_TAB_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_WAYSTATION_AUTO_CLAIM_ACTIVATION,
  ...CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT,
  {
    createdAt: 1791803592000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "Resource clues now show on the map",
    why: "Land near Titanium, Umbrite and Crystal carries a clue (ferrous dust, blackwood canopy, refractive ground), but the clues were lost on every server restart, never sent when you logged in, and drawn too faintly to see. Occupation-survey reports from conquered towns also vanished after a few dozen other events.",
    changes: [
      "Clue tiles now get a clear tint on both the 3D and 2D maps: rust for Titanium, violet for Umbrite, ice-cyan for Crystal",
      "Selecting a clue tile explains it in the tile overview, e.g. \"Ferrous dust: Titanium deposits are likely within a few tiles\"",
      "Garrisoning a neutral town now surveys the land around it: nearby clues become a report like \"Titanium likely north-east of this town\" (capturing an enemy town no longer does)",
      "Survey reports are no longer pushed out of your event log by later events"
    ]
  },
  {
    createdAt: 1791804620000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.2",
    title: "Manifest panel: clearer details, Good pick badge, clickable owned list",
    why: "The tech details were boxes inside boxes, listed the same unlocks three times, scrolled the whole panel so the name and Unlock button slid out of view, and never said whether a pick fit your empire. Your owned techs were a list you couldn't click.",
    changes: [
      "The Technology Tree is now the Manifest panel; each entry shows its type, e.g. \"AFC Module · War · Tier 1\"",
      "Details are one clean card: name and status stay at the top, the Unlock button (with its cost) stays at the bottom, and only the middle scrolls",
      "\"What you get\" lists every building, ability, revealed resource and bonus once, with a short description",
      "A Good pick badge appears when it fits your empire right now -- signs of its resource near your land, a survey from a neutral town you garrisoned, or a building you can start immediately; a note warns when everything it unlocks needs a resource you don't hold yet",
      "\"Leads to\" shows the next Manifests, what else each still needs, and how many more come after",
      "Your Manifests are grouped by branch as buttons; tap one to see what it gave you",
      "Rigging Works Module now lists the Umbrite Rig it unlocks"
    ]
  },
  ...OCTOBER_STRUCTURE_ART_CHANGELOG,
  {
    createdAt: 1791836603366, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.1",
    title: "Combat reports for each muster flag",
    why: "Simultaneous muster attacks interrupted play with repeated battle-result overlays.",
    changes: ["Automatic muster battles appear in each flag’s Recent combat tab with unread counts", "Manpower losses show in red and coin plunder in green", "Keep up to 40 reports per flag in this browser for this season", "New results keep your reading position and leave unrelated manual orders running"]
  },
  {
    createdAt: 1791921497137,
    introducedIn: "2026.10.13.1",
    title: "Hydrogardens no longer stand on the old farm plot",
    why: "The hydroponic glass dome was drawn on top of the conventional 3D crop-field plot, so it looked like a greenhouse dropped onto a normal farm.",
    changes: ["A built Hydrogarden now replaces the old 3D farm plot, so the dome stands on clean ground"]
  },
  {
    createdAt: 1791922549550, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Economy panel says Coin",
    why: "The economy panel still called the currency Gold while the rest of the game says Coin.",
    changes: ["The economy panel's currency card and detail heading now read Coin"]
  },
  {
    createdAt: 1791925158695, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.3",
    title: "Your border shows up as soon as you log in",
    why: "In the 3D map, your Aether Survey Line border and the dormant-frontier and rival-incursion tints could stay hidden after login until something on screen changed. If you were idle and didn't move the camera, they might never appear.",
    changes: ["The 3D border appears right after login, even with a still camera", "Reach updates from the server redraw the 3D border straight away"]
  },
  {
    createdAt: 1791925495773, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Tell your own territory apart",
    why: "Every empire's reach border looked the same apart from colour, neighbours could pick near-identical colours, and enemy tiles taken inside your reach looked like your own.",
    changes: [
      "Your reach border now glows brighter and thicker with a white core and a slow pulse; other empires' borders are thinner and dimmer",
      "On your screen, rival colours that are too close to yours are shifted away from it",
      "Enemy tiles inside your reach are striped in their colour and yours, with an outline around the pocket",
      "The 2D map draws your reach border in your colour with a white core, and shows the same striping"
    ]
  },
  {
    createdAt: 1791959048426,
    introducedIn: "2026.10.14.1",
    title: "3D map shows frontier claims on time",
    why: "The 3D map timed frontier-attack claims with the wrong clock, so it often missed muster and enemy claims starting or ending until something else refreshed the map.",
    changes: ["An enemy's frontier colour clears as soon as your muster attack's claim sweep begins", "Your frontier tile's colour clears as soon as an enemy's claim sweep begins on it", "A frontier tile's colour comes back as soon as a claim ends"]
  }
];

const latestCreatedAt = Math.max(...ALL_CLIENT_CHANGELOG_ENTRIES.map((entry) => entry.createdAt));
const oldestAllowedAt = latestCreatedAt - 6 * 24 * 60 * 60 * 1000;

export const CLIENT_CHANGELOG_ENTRIES = ALL_CLIENT_CHANGELOG_ENTRIES.filter(
  (entry) => entry.createdAt >= oldestAllowedAt
);
