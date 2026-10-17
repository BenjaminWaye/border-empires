import { AETHER_ABILITY_ICONS_CHANGELOG } from "./client-changelog-aether-ability-icons.js";
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
import { TILE_YIELD_REMOVAL_CHANGELOG } from "./client-changelog-tile-yield-removal.js";
import { AI_PROGRESSION_AETHER_CHANGELOG } from "./client-changelog-ai-progression-aether.js";
import { FAIRER_AI_DEALS_CHANGELOG } from "./client-changelog-fairer-ai-deals.js";
import { OVERLAY_PERSISTENCE_CHANGELOG } from "./client-changelog-overlay-persistence.js";
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
import { CLIENT_CHANGELOG_ENTRIES_OCT_12 } from "./client-changelog-data-oct-12.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT } from "./client-changelog-afc-hill-cut.js";
import { CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS } from "./client-changelog-compact-met-players.js";
import { CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_LOADING } from "./client-changelog-town-growth-loading.js";
import { CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_WAR_INTEGRITY } from "./client-changelog-town-growth-war-integrity.js";
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
    createdAt: 1792044007050, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.15.1",
    title: "Warnings for enemy muster flags near your border",
    why: "An enemy could stage troops on a muster flag right next to your land, and you only found out once the attack landed.",
    changes: [
      "A warning pops up when an enemy muster flag appears within 4 tiles of your territory, or an existing one switches to Advance or March, with a button to center on it",
      "Enemy flags near your border get a red off-screen pointer in both map renderers, ahead of your own alerts while still leaving room for them",
      "Flags of allies and truce partners don't trigger warnings"
    ]
  },
  {
    createdAt: 1791970358363, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.14.3",
    title: "Enemy frontier warnings refer to their owner's reach",
    why: "An enemy tile's decay timer incorrectly said beyond your reach even when it was within yours.",
    changes: ["Enemy frontier decay warnings now refer to the tile owner's reach in both map renderers"]
  },
  {
    createdAt: 1791969768256, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.14.2",
    title: "Waystation rewards show current technology names",
    why: "The tile overview showed old technology names such as Leatherworking instead of their current Manifest names.",
    changes: ["All Waystation technology rewards now use the current tech catalog name in the tile overview, including previously activated sites"]
  },
  ...AUTO_GARRISON_REQUEUE_CHANGELOG,
  ...RIVERS_MOUNTAINS_CHANGELOG,
  {
    createdAt: 1791969340091, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.4",
    title: "Manifest details stay where you scroll",
    why: "Live game updates kept rebuilding Manifest details and jumping the menu back to the top.",
    changes: ["Mobile and desktop Manifest details keep their scroll position while coin and unlock status update"]
  },
  {
    createdAt: 1791970194502,
    introducedIn: "2026.10.14.2",
    title: "Hidden dock connections stay hidden",
    why: "Selecting an enemy dock lit up undiscovered linked docks on the minimap and offered navigation into fog.",
    changes: ["Selecting a dock no longer reveals hidden connections on the minimap or either map renderer", "Dock navigation only visits discovered destinations; garrisoning a dock reveals its links", "3D dock routes update as soon as linked docks are discovered, even while the same dock stays selected"]
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
  ...CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_LOADING,
  ...CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_WAR_INTEGRITY,
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
    createdAt: 1792009197862, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.3",
    title: "AI empires weigh your truce and alliance offers",
    why: "AI empires accepted truces almost instantly, and repeat offers could be spammed at any player.",
    changes: [
      "AI empires now judge relative strength, shared borders, food, and past broken truces, and tell you why they accepted or declined",
      "AI empires now answer alliance offers too",
      "After an offer is declined or cancelled, you can't send that player the same kind of offer for 30 minutes (10 minutes after an unanswered truce offer expires)"
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
  ...AETHER_ABILITY_ICONS_CHANGELOG,
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
  ...CLIENT_CHANGELOG_ENTRIES_OCT_12,
  ...CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT,
  ...CLIENT_CHANGELOG_ENTRIES_COMPACT_MET_PLAYERS,
  {
    createdAt: 1791921253260, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Empire Integrity moves to the Economy panel",
    why: "Playtesters watched Empire Integrity fall as they expanded and read it as being punished. In fact it was still a bonus, and some updates briefly showed it lower than it really was.",
    changes: [
      "Empire Integrity now lives in the Economy panel; the top bar only shows it, with a warning, once it drops below 50% and actually reduces your coin and growth",
      "Fixed integrity sometimes showing lower than it really was (e.g. 80% for a small new empire) after changing your profile or colour, toggling auto-garrison, or using an ability"
    ]
  },
  {
    createdAt: 1791927499454, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Top bar icons are labelled",
    why: "Playtesters couldn't tell what the icons in the top-right corner opened without hovering over each one.",
    changes: [
      "Manifest, Allies, Ranks, Activity, Sharding and Settings now show their name under the icon on desktop",
      "The Alerts (bell) button has been removed from the top bar and the mobile menu while the alerts feed is reworked -- the Activity dashboard is where to see what happened"
    ]
  },
  ...OCTOBER_STRUCTURE_ART_CHANGELOG,
  ...TILE_YIELD_REMOVAL_CHANGELOG,
  ...AI_PROGRESSION_AETHER_CHANGELOG,
  ...FAIRER_AI_DEALS_CHANGELOG,
  ...OVERLAY_PERSISTENCE_CHANGELOG,
  {
    createdAt: 1792187006316, // frozen Date.now() value for this release
    introducedIn: "2026.10.16.1",
    title: "New empires land with a manpower reserve",
    why: "New players ran out of manpower within the first 15-20 minutes, and manpower only refills every few hours.",
    changes: [
      "Every new empire -- yours when you join, and AI empires when a season starts -- lands with a one-time +1,000 manpower on top of its starting manpower",
      "The reserve can sit above your manpower cap; regeneration pauses until you have spent back below the cap"
    ]
  },
  {
    createdAt: 1791905157542, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Relay Beacons show where to build them",
    why: "Playtesters placed Relay Beacons by trial and error -- dropping them inside reach they already had, or cancelling and re-placing them -- and the new-player checklist said to build a beacon without showing where.",
    changes: [
      "When nothing worth taking is in reach, the new-player checklist now marks the tile to build your Relay Beacon on, aimed at the nearest town or food you still need",
      "On that marked tile, Build Relay Beacon is tagged ★ Recommended and listed first",
      "Choosing Build Relay Beacon now lets you pick the spot first, with the new land it would reach shaded before you confirm",
      "Works on both the 3D and 2D maps"
    ]
  },
  {
    createdAt: 1792006774817, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.3",
    title: "AI empires stand down after a truce",
    why: "An AI empire kept its muster flag, and the manpower in it, up for days after signing a truce with the player it was fighting.",
    changes: [
      "An AI empire now disbands a muster flag once it has nothing left to attack, such as after it signs a truce or alliance with no barbarians nearby, and gets that manpower back",
      "AI empires no longer plant new muster flags or plan attacks against players they have a truce or alliance with"
    ]
  },
  {
    createdAt: 1791922964029, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Manifest panel tabs",
    why: "Your Manifests sat at the very bottom of the panel, below every choice.",
    changes: ["The Manifest panel has Available and Owned tabs; a Tree view / List view toggle in the panel header replaces Expand Tree, and the tree now fills the whole window", "Owned shows how many Manifests you hold, your Manifest bonuses, and your Manifests grouped by branch", "Panels on mobile use the same brass-and-leather look as on desktop instead of a blue background", "On mobile the Manifest panel uses the full screen height in both views", "The tree's zoom control sits on one row with the unlocked/ready/total counts, and the tree's bottom edge is no longer cut off"]
  },
  {
    createdAt: 1791836603366, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.1",
    title: "Combat reports for each muster flag",
    why: "Simultaneous muster attacks interrupted play with repeated battle-result overlays.",
    changes: ["Automatic muster battles appear in each flag’s Recent combat tab with unread counts", "Manpower losses show in red and coin plunder in green", "Keep up to 40 reports per flag in this browser for this season", "New results keep your reading position and leave unrelated manual orders running"]
  },
  {
    createdAt: 1791969446372, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.4",
    title: "Smoother fog reveals in the 3D map",
    why: "Fog rolling back could leave tile-shaped cuts in the glowing edge between newly explored tiles.",
    changes: ["The 3D fog and its glowing edge now stay continuous across tile boundaries during reveals"]
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
  },
  {
    createdAt: 1791971113032,
    introducedIn: "2026.10.14.2",
    title: "Next manpower batch front and centre",
    why: "The manpower panel buried when your next batch arrives inside a long paragraph, and showed the time until full as raw minutes like \"738m 18s\".",
    changes: [
      "The manpower panel now shows \"Next batch in ...\" as a large callout at the top in hours and minutes, e.g. \"0h 19m\" (or \"Full\" / \"Paused\")",
      "Time until full also reads in hours and minutes, e.g. \"Manpower full in 12h 19m\"",
      "The explanation of how manpower works is tucked behind a \"?\" toggle"
    ]
  },
  {
    createdAt: 1791970096634, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.3",
    title: "AI names in Alliances",
    why: "The Alliances tab showed generic AI numbers instead of the empires' names.",
    changes: ["Met AI empires and allies show their seasonal names", "Alliance and truce offers still reach the correct AI"]
  },
  {
    createdAt: 1791977894863,
    introducedIn: "2026.10.14.4",
    title: "Testing new outlines for enemy land inside your border",
    why: "Enemy tiles taken inside your reach only get a plain outline, which doesn't read as a break-in. Admins are trying new looks on the 3D map before one becomes the default.",
    changes: [
      "Nothing changes for players yet: the outline stays as it is until a new look is chosen",
      "Admins can try a spiked front line in the attacker's colour, an ember seam, an ink bleed or an aether veil under Settings > Admin"
    ]
  },
  {
    createdAt: 1792001165636, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.5",
    title: "Coin everywhere",
    why: "Several places still called the currency gold while the HUD and economy panel say Coin.",
    changes: [
      "Structure details, Mintworks and Sell Off modifiers, upkeep lines, the Harbor Exchange, Imperial Exchange and Siege Engine entries now say coin",
      "Activity feed, raid and plunder summaries, town capture character, season-end income, the respawn prompt, natural wonder boons and two Manifest descriptions now say coin",
      "Fixed the not-enough-coin alert for attacks and frontier claims, which could miss its dedicated message because the server still said gold"
    ]
  },
  {
    createdAt: 1791969150437, // Date.now() captured for this update.
    introducedIn: "2026.10.14.1",
    title: "Softer 3D map daylight",
    why: "Strong stacked lighting made terrain and pale buildings look washed out.",
    changes: ["Reduced 3D daylight and exposure to preserve surface detail", "Neutral fill light keeps terrain and building colours clearer"]
  },
  {
    createdAt: 1791970552590, // Date.now() captured for this release.
    introducedIn: "2026.10.14.2",
    title: "Manifest recommendations visible in the list",
    why: "Recommendations were hidden in details and suggested Hydrogardens without usable Farms or a need for more Food.",
    changes: [
      "Good pick now appears in both the compact Manifest list and expanded tree; click a Manifest for its explanation",
      "Building recommendations check for an owned, unoccupied tile of the required kind and available development capacity",
      "Hydroworks recommendations require a nearby active Hydrogarden that does not already have its bonus",
      "Hydrogarden, Hydroworks and Fish Food bonuses are only recommended with one spare Food slot or less"
    ]
  },
  {
    createdAt: 1791982864990, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.1",
    title: "Town resource discoveries get a lasting popup",
    why: "Important resource clues were easy to miss in brief map labels and the retiring Alerts panel.",
    changes: [
      "Town surveys use the game's brass panels, parchment text, and familiar buttons in both map renderers",
      "Unresolved resource surveys remain available in Activity → Yours with a View survey button, even beyond the 24-hour history window",
      "New surveys open a centered popup that stays until you choose View survey or Got it, even when the clue is off-screen"
    ]
  },
  {
    createdAt: 1792006593148, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.5",
    title: "Flags head into enemy territory instead of around it",
    why: "Marching flags could keep claiming neutral tiles beside an enemy border, and advancing flags on a dock wandered their island while fighting the enemy dock across the water.",
    changes: [
      "Marching flags now follow the straight line to their target, attacking enemy tiles on that line rather than detouring onto neutral land beside them",
      "Advancing flags on a dock keep their manpower on the fight at the linked enemy dock instead of wandering around their own island"
    ]
  },
  {
    createdAt: 1792006675564, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Snow shows up on the 3D map",
    why: "Snowfields near the poles were drawing exactly like the surrounding tundra in 3D, so the snow never appeared.",
    changes: ["The coldest polar ground now renders as white snow in 3D, matching the 2D map"]
  },
  {
    createdAt: 1792044983124, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Trade screen for truces and alliances",
    why: "Offering a truce was a single button with no way to sweeten the deal or know how it would land.",
    changes: [
      "Offering a truce or alliance opens a trade screen: add coin or Shards you give or ask for, and see the empire's mood toward you",
      "Against AI empires the screen shows live whether they would accept, and how much more coin they want",
      "AI empires remember how you treat them: taking their land, attacking, breaking truces and paying them all shift their attitude, shown on the trade screen",
      "Truce prices depend on whether you're at war and who is winning; AIs won't talk peace right after you attack, and charge more each time you buy peace",
      "Alliances need an AI that likes you and would be the largest empire in the alliance (Diplomatic Dominance goes to the largest member); AIs never pay to join one",
      "An AI gives 24h notice to leave an alliance once a partner grows larger than it",
      "AI empires counter-offer with a price you can actually pay, or tell you their price is more than you can offer",
      "Coin and Shards change hands only when the deal is accepted, and the deal falls through if either side can no longer pay",
      "Pending offers show their terms in the Alliances panel"
    ]
  },
  {
    createdAt: 1792042002455, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "War music stops when your flag has nothing to fight",
    why: "An advancing muster flag on a border with a truce partner kept battle music playing even though it could not attack.",
    changes: [
      "Advance and March flags with no target in range no longer keep battle music playing"
    ]
  },
  {
    createdAt: 1792062991009, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Captured tiles can't be taken straight back",
    why: "A freshly captured dock or town lands as frontier, and frontier had no defense, so the old owner could retake it for free and captures just went back and forth.",
    changes: [
      "For 1 minute after you capture a tile from another player, your troops stay standing on it and it defends like ordinary ground, so retaking it is a real fight",
      "If it is attacked during that minute, those troops are the defenders in the battle; time to garrison it is what the minute is for",
      "The tile menu shows a Holding captured ground countdown, and in 2D the holding troops are drawn on the tile with a bar for the time left"
    ]
  },
  {
    createdAt: 1792203815485,
    introducedIn: "2026.10.17.1",
    title: "Enemy breakthroughs get a spiked front line",
    why: "Enemy tiles taken inside your reach only had a plain outline, which didn't read as a break-in.",
    changes: [
      "On the 3D map, enemy land inside your reach is now outlined by a thin front line in the attacker's colour, with tall spikes pointing into your land",
      "Spikes only appear where the enemy touches your own land, and the line stops at the old border when they push across it",
      "The 2D map keeps the plain outline for now"
    ]
  },
  {
    createdAt: 1792270895359,
    introducedIn: "2026.10.17.2",
    title: "Good pick Manifests stand out, and mean more",
    why: "The small orange Good pick pill was easy to miss and used the same colour as missing-resource warnings. It also appeared on almost every Manifest, because nearly any unlocked building can be built right away.",
    changes: [
      "Good pick Manifests now get a gold band across the top of the card and a gold frame, in the Manifest list, the expanded tree and the Manifest details",
      "Being able to build a Manifest's building right away no longer makes it a Good pick on its own",
      "Good pick now means signs of the resource it reveals near your land (or from a town you garrisoned), or extra Food when your Food capacity is tight"
    ]
  },
  {
    createdAt: 1792257568272,
    introducedIn: "2026.10.17.1",
    title: "Prospect clues look like what they are",
    why: "Blackwood canopy, ferrous dust and refractive ground were just coloured patches on the map, so nothing about them looked like a canopy, dust or crystal.",
    changes: [
      "Blackwood canopy: trees on the tile turn violet-black, and open ground grows gaunt blackwood trees",
      "Ferrous dust: rust-red flecks are scattered over the ground",
      "Refractive ground: a pale glassy glint or two half-buried in the soil",
      "The coloured patch under clue tiles is gone, and the tile menu only explains a clue on tiles that show it; works on both the 3D and 2D maps"
    ]
  },
  {
    createdAt: 1792265619894,
    introducedIn: "2026.10.17.1",
    title: "Better Relay Beacon tips after landing",
    why: "Right after your AFC landed, the AFC tile was selected for no reason, and the guide suggested building your first Relay Beacon on the AFC. A beacon there shows almost nothing your AFC can't already see.",
    changes: [
      "Your AFC no longer lands with its tile selected",
      "The suggested Relay Beacon spot now goes by how much new land it shows you and brings into reach, so it usually sits at the edge of your land instead of on the AFC",
      "The suggested spot can be any land inside your reach: on your frontier, Build Relay Beacon garrisons the tile first, and on unclaimed land it expands, garrisons, then builds"
    ]
  },
  {
    createdAt: 1792269690926, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.2",
    title: "Manufactories turn town industry into Coin credit",
    why: "The stackable economic building represents manufactured output backing offworld purchasing credit.",
    changes: ["Mintworks are now Manufactories, preserving their costs, income, stacking and Clearing House bonuses", "The Industrial Tooling Module fabricates and refurbishes equipment for local Manufactories; new construction requires the module installed on an active AFC", "New factory artwork appears in both the 3D and 2D maps; existing buildings and queued builds carry over"]
  }
];

const latestCreatedAt = Math.max(...ALL_CLIENT_CHANGELOG_ENTRIES.map((entry) => entry.createdAt));
const oldestAllowedAt = latestCreatedAt - 6 * 24 * 60 * 60 * 1000;

export const CLIENT_CHANGELOG_ENTRIES = ALL_CLIENT_CHANGELOG_ENTRIES.filter(
  (entry) => entry.createdAt >= oldestAllowedAt
);
