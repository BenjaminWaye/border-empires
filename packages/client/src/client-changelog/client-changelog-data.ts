import { RELIABLE_DIPLOMACY_CHANGELOG } from "./client-changelog-reliable-diplomacy.js";
import { AFC_SPECIALIZATIONS_CHANGELOG } from "./client-changelog-afc-specializations.js";
import { ALLIANCES_TAB_CHANGELOG } from "./client-changelog-alliances-tab.js";
import { ENEMY_MUSTER_WARNING_CHANGELOG, FRONTIER_REACH_WARNING_CHANGELOG } from "./client-changelog-enemy-muster-warning.js";
import { CLIENT_CHANGELOG_ENTRIES_OCT_17 } from "./client-changelog-oct-17.js";
import { AETHER_ABILITY_ICONS_CHANGELOG } from "./client-changelog-aether-ability-icons.js";
import { OCTOBER_STRUCTURE_ART_CHANGELOG } from "./client-changelog-structure-art-october.js";
import { AUTO_GARRISON_REQUEUE_CHANGELOG } from "./client-changelog-auto-garrison-requeue.js";
import { AFC_UPGRADES_ICON_CHANGELOG } from "./client-changelog-afc-upgrades-icon.js";
import { GAMEPLAY_SETTINGS_CLEANUP_CHANGELOG } from "./client-changelog-gameplay-settings-cleanup.js";
import { MUSTER_BANNER_CHANGELOG } from "./client-changelog-muster-banner.js";
import { ADVANCE_VISIBLE_ONLY_CHANGELOG } from "./client-changelog-advance-visible-only.js";
import { CLIENT_CHANGELOG_ENTRIES_OCT_19_20 } from "./client-changelog-oct-19-20.js";
import { CLIENT_CHANGELOG_ENTRIES_OCT_13_16 } from "./client-changelog-oct-13-16.js";
import { CAPTURE_HOLD_EFFORT_CHANGELOG } from "./client-changelog-capture-hold-effort.js";
import { HETZNER_CLIENT_HOSTING_CHANGELOG } from "./client-changelog-hetzner-client-hosting.js";
import { AI_DEAL_SUGGEST_CHANGELOG } from "./client-changelog-ai-deal-suggest.js";
import { TOWN_MARBLE_CHANGELOG } from "./client-changelog-town-marble.js";
import { SIEGE_REPORTS_CHANGELOG } from "./client-changelog-siege-reports.js";
import { RICHER_FORESTS_CHANGELOG } from "./client-changelog-richer-forests.js";
import { SIEGE_FX_GATE_CHANGELOG } from "./client-changelog-siege-fx-gate.js";
import { INCURSION_HATCH_HILLS_CHANGELOG } from "./client-changelog-incursion-hatch-hills.js";
import { MARCH_ACROSS_WATER_CHANGELOG } from "./client-changelog-march-across-water.js";
import { MARCH_UNEXPLORED_CHANGELOG } from "./client-changelog-march-unexplored.js";
import { MARCH_STOP_SHORT_CHANGELOG } from "./client-changelog-march-stop-short.js";
import { RECONNECT_NO_AUTH_CHANGELOG } from "./client-changelog-reconnect-no-auth.js";
import { PLANETARY_DEFENSE_MUSTER_FLAG_CHANGELOG } from "./client-changelog-planetary-defense-muster-flag.js";
import { YOURS_TILE_COORDS_CHANGELOG } from "./client-changelog-yours-tile-coords.js";
import { MAP_NAMES_CHANGELOG } from "./client-changelog-map-names.js";
import { REACH_OWNER_NAME_CHANGELOG } from "./client-changelog-reach-owner-name.js";
import { MUSTER_COMMIT_BADGE_CHANGELOG } from "./client-changelog-muster-commit-badge.js";
import { ACTIVITY_RESTART_WINDOW_CHANGELOG } from "./client-changelog-activity-restart-window.js";
import { FOGGED_MIST_FEATURES_CHANGELOG } from "./client-changelog-fogged-mist-features.js";
import { EXPIRED_TRUCE_OFFERS_CHANGELOG } from "./client-changelog-expired-truce-offers.js";
import { LOST_STRUCTURES_CHANGELOG } from "./client-changelog-lost-structures.js";
import { CAPTURED_MUSTER_CLEAR_CHANGELOG } from "./client-changelog-captured-muster-clear.js";
import { ADVANCE_EFFORT_CHANGELOG } from "./client-changelog-advance-effort.js";
import { FASTER_ATTACKS_FRONTIER_COST_CHANGELOG } from "./client-changelog-faster-attacks-frontier-cost.js";
import { AFC_MODULE_MODELS_CHANGELOG } from "./client-changelog-afc-module-models.js";
import { MARCH_ATTACK_DEEP_CHANGELOG } from "./client-changelog-march-attack-deep.js";
import { WAR_INDUSTRY_SQUADS_CHANGELOG } from "./client-changelog-war-industry-squads.js";
import { MARCH_ATTACK_ROUTES_CHANGELOG } from "./client-changelog-march-attack-routes.js";
import { FORT_WALL_OPENINGS_CHANGELOG } from "./client-changelog-fort-wall-openings.js";
import { HILL_GARRISON_FILL_CHANGELOG } from "./client-changelog-hill-garrison-fill.js";
import { SHARD_COMEBACK_CHANGELOG } from "./client-changelog-shard-comeback.js";
// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered --
// client-changelog.ts sorts by createdAt.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry. When new entries age older ones out
// of that window, move those entries into the next
// client-changelog-data-earlier-N.ts (historical record, left unreferenced)
// and delete them here and from the per-feature files below.
import { ALLIED_PROSPERITY_CHANGELOG } from "./client-changelog-allied-prosperity.js";
import { RECENT_CLIENT_CHANGELOG_ENTRIES } from "./client-changelog-data-october.js";
import { TILE_YIELD_REMOVAL_CHANGELOG } from "./client-changelog-tile-yield-removal.js";
import { AI_PROGRESSION_AETHER_CHANGELOG } from "./client-changelog-ai-progression-aether.js";
import { FAIRER_AI_DEALS_CHANGELOG } from "./client-changelog-fairer-ai-deals.js";
import { OVERLAY_PERSISTENCE_CHANGELOG } from "./client-changelog-overlay-persistence.js";
import { AFC_MODULE_TAB_CHANGELOG } from "./client-changelog-afc-module-tab.js";
import { OUT_OF_REACH_NO_DECAY_CHANGELOG } from "./client-changelog-out-of-reach-no-decay.js";
import { FRONTIER_SUPPLY_LINES_CHANGELOG } from "./client-changelog-frontier-supply-lines.js";
import { MANPOWER_BATCH_LABEL_CHANGELOG } from "./client-changelog-manpower-batch-label.js";
import { RESTART_TILE_STATE_CHANGELOG } from "./client-changelog-restart-tile-state.js";
import { RESTART_MANPOWER_CHANGELOG } from "./client-changelog-restart-manpower.js";
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
import { MOBILE_LOADING_FIT_CHANGELOG } from "./client-changelog-mobile-loading-fit.js";
import { CLIENT_CHANGELOG_ENTRIES_WAYSTATION_AUTO_CLAIM_ACTIVATION } from "./client-changelog-waystation-auto-claim-activation.js";
import { CLIENT_CHANGELOG_ENTRIES_OCT_12 } from "./client-changelog-data-oct-12.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT } from "./client-changelog-afc-hill-cut.js";
import { CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_LOADING } from "./client-changelog-town-growth-loading.js";
import { CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_WAR_INTEGRITY } from "./client-changelog-town-growth-war-integrity.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_105 } from "./client-changelog-data-earlier-105.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const ALL_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...AFC_SPECIALIZATIONS_CHANGELOG,
  ...ALLIANCES_TAB_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_OCT_17,
  ENEMY_MUSTER_WARNING_CHANGELOG,
  FRONTIER_REACH_WARNING_CHANGELOG,
  {
    createdAt: 1791969768256, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.14.2",
    title: "Waystation rewards show current technology names",
    why: "The tile overview showed old technology names such as Leatherworking instead of their current Manifest names.",
    changes: ["All Waystation technology rewards now use the current tech catalog name in the tile overview, including previously activated sites"]
  },
  ...AUTO_GARRISON_REQUEUE_CHANGELOG,
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
  ...MANPOWER_BATCH_LABEL_CHANGELOG,
  ...RESTART_TILE_STATE_CHANGELOG,
  ...RESTART_MANPOWER_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_LOADING,
  ...CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_WAR_INTEGRITY,
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
  ...CLIENT_CHANGELOG_ENTRIES_AFC_LANDING,
  ...OUT_OF_REACH_NO_DECAY_CHANGELOG,
  ...FRONTIER_SUPPLY_LINES_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_2D_SETTLE_DOTS,
  ...CLIENT_CHANGELOG_ENTRIES_GARRISON_RENAME,
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...CLIENT_CHANGELOG_ENTRIES_MUSTER_SAVE_UP,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...ALLIED_PROSPERITY_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_SEPT_24_26,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS,
  ...CLIENT_CHANGELOG_ENTRIES_FAST_BUILDS,
  ...CLIENT_CHANGELOG_ENTRIES_BUILD_SPEED_MENUS,
  ...CLIENT_CHANGELOG_ENTRIES_HINT_CENTER_BUTTON,
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
  ...CLIENT_CHANGELOG_ENTRIES_OCT_13_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_105,
  {
    createdAt: 1792269690926, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.2",
    title: "Manufactories turn town industry into Coin credit",
    why: "The stackable economic building represents manufactured output backing offworld purchasing credit.",
    changes: ["Mintworks are now Manufactories, preserving their costs, income, stacking and Clearing House bonuses", "The Industrial Tooling Module fabricates and refurbishes equipment for local Manufactories; new construction requires the module installed on an active AFC", "New factory artwork appears in both the 3D and 2D maps; existing buildings and queued builds carry over"]
  },
  {
    createdAt: 1792274781110, // Date.now() captured once for this release.
    introducedIn: "2026.10.18.1",
    title: "Automatic reconnection keeps trying through server updates",
    why: "Long outages exhausted the retry budget and forced page reloads; a reopened connection could also get stuck before restoring your empire.",
    changes: [
      "Long interruptions keep retrying in place without automatically refreshing the page",
      "A reconnect that makes no progress for a minute automatically starts a fresh connection",
      "Login queue updates and ongoing map downloads extend that timeout so active recovery can finish",
      "Recovery pauses after sign-out; signing back in reopens a closed connection"
    ]
  },
  {
    createdAt: 1792307935274, // Date.now() frozen for this release.
    introducedIn: "2026.10.18.1",
    title: "AFC upgrades are easier to find and compare",
    why: "Upgrade choices were easy to miss, and opening a separate detail screen made comparing them awkward on phones.",
    changes: [
      "AFC Upgrades replaces Sharding in navigation, with installed upgrades and their tiers above the current choices, inline details on phones and comparison cards beside details on desktop",
      "A clickable upgrade-ready badge appears above your active AFCs in both map renderers; the navigation count stays visible when the AFC is offscreen",
      "Owned AFC overviews link directly to upgrades, and availability follows your current resources and prerequisites; existing upgrade costs and rewards stay the same"
    ]
  },
  {
    createdAt: 1792399197096, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.19.1",
    title: "Choose exactly which tiles to garrison",
    why: "Garrison Connected queued a whole region immediately, making it hard to control where manpower went.",
    changes: [
      "Garrison Many lets you tap frontier tiles to select or deselect them, with highlights in both map renderers",
      "The bottom bar shows the selected count and total cost, with Confirm and Cancel; keep tapping tiles to adjust the selection",
      "Confirmation checks ownership, reach and resources; unavailable selected tiles turn orange so you can deselect them before spending",
      "Dragging and pinching still move the map; taps select tiles once",
    "Alert markers still center on their targets, and deselected tiles lose their outline in both map renderers"
    ]
  },
  {
    createdAt: 1792418764643, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.19.2",
    title: "Diplomacy offers say what's offered, and you can counter them",
    why: "Pending offers in the Alliances tab only showed a name, an internal player ID and a duration, so it wasn't clear whether a card was an alliance or a truce, and the only answers were yes or no.",
    changes: [
      "Pending offers now read \"Offers an alliance\" or \"Offers a 12h truce\" under the player's name (\"You offered…\" for your own)",
      "New Counter button on offers you receive: it opens the trade screen with their offer filled in, so you can change the duration or ask for coin (\"only if you pay 24 coin\") and send it back",
      "Sending a counter replaces their offer with yours, without the 30-minute wait a plain Reject puts on them offering again",
      "Internal player IDs are no longer shown on alliance, truce and ally cards"
    ]
  },
  {
    createdAt: 1792430700163, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.19.3",
    title: "No more ground poking through the fog beside mountains",
    why: "In the 3D map, an unexplored mountain at the edge of the fog could push a straight-edged wedge of bare ground up through the storm, cutting a notch in its glowing edge.",
    changes: ["Ground at the fog's edge now stays under the storm, so the fog and its glowing edge stay unbroken next to mountains"]
  },
  {
    createdAt: 1792444750777, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.19.5",
    title: "Tidier combat reports on muster flags",
    why: "The flag's combat report list still used the old blue colours inside the brass tile popup, and its long tab label squeezed onto two lines.",
    changes: ["The Recent combat tab is now just \"Combat\", with its unread count as a small bubble on the tab's corner, so all the tile popup tabs fit on one row", "Combat reports use the same brass-and-parchment look as the rest of the popup"]
  },
  ...RELIABLE_DIPLOMACY_CHANGELOG,
  ...GAMEPLAY_SETTINGS_CLEANUP_CHANGELOG,
  ...AFC_UPGRADES_ICON_CHANGELOG,
  ...MUSTER_BANNER_CHANGELOG,
  ...ADVANCE_VISIBLE_ONLY_CHANGELOG,
  ...AI_DEAL_SUGGEST_CHANGELOG,
  {
    createdAt: 1792442407428, // Date.now() captured for this entry.
    introducedIn: "2026.10.19.4",
    title: "Free AFC upgrades appear correctly after login",
    why: "New-campaign players could see the old paid catalogue before choosing their first upgrade.",
    changes: [
      "Login and reconnect show free AFC choices unlocked by your Manifest tiers",
      "All 30 upgrade cards use short effect lines with percentages; expanded details explain conditions"
    ]
  },
  ...CLIENT_CHANGELOG_ENTRIES_OCT_19_20,
  ...HETZNER_CLIENT_HOSTING_CHANGELOG,
  ...CAPTURE_HOLD_EFFORT_CHANGELOG,
  ...TOWN_MARBLE_CHANGELOG,
  {
    createdAt: 1792528401682, // Date.now() captured for this entry.
    introducedIn: "2026.10.21.2",
    title: "Muster flag bases no longer look black",
    why: "On the 3D map, the base under a muster flag was dark iron that showed as a black band wherever the ground sloped away from it.",
    changes: [
      "In the 3D map, muster flags stand on a stone foundation that widens towards the ground and catches the light",
      "Town bases widen towards the ground the same way, so their stone walls catch more light on sloping tiles"
    ]
  },
  ...SIEGE_REPORTS_CHANGELOG,
  ...RICHER_FORESTS_CHANGELOG,
  ...SIEGE_FX_GATE_CHANGELOG,
  ...INCURSION_HATCH_HILLS_CHANGELOG,
  ...MARCH_ACROSS_WATER_CHANGELOG,
  ...MARCH_UNEXPLORED_CHANGELOG,
  ...MARCH_STOP_SHORT_CHANGELOG,
  ...RECONNECT_NO_AUTH_CHANGELOG,
  ...PLANETARY_DEFENSE_MUSTER_FLAG_CHANGELOG,
  ...YOURS_TILE_COORDS_CHANGELOG,
  ...MAP_NAMES_CHANGELOG,
  ...REACH_OWNER_NAME_CHANGELOG,
  ...MUSTER_COMMIT_BADGE_CHANGELOG,
  ...ACTIVITY_RESTART_WINDOW_CHANGELOG,
  ...FOGGED_MIST_FEATURES_CHANGELOG,
  ...EXPIRED_TRUCE_OFFERS_CHANGELOG,
  ...LOST_STRUCTURES_CHANGELOG,
  ...CAPTURED_MUSTER_CLEAR_CHANGELOG,
  ...ADVANCE_EFFORT_CHANGELOG,
  ...FASTER_ATTACKS_FRONTIER_COST_CHANGELOG,
  ...AFC_MODULE_MODELS_CHANGELOG,
  ...MARCH_ATTACK_DEEP_CHANGELOG,
  ...MARCH_ATTACK_ROUTES_CHANGELOG,
  {
    createdAt: 1792832339274, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.1",
    title: "Forced Ancillarification",
    why: "A flat population sacrifice becomes trivial in large towns. The cost should grow with the population at stake.",
    changes: ["Active Ancillary Factories can convert residents from their supported town into 100 immediate manpower, even above the cap. The menu shows exactly how many people will be taken.", "Each town can be forced once every four hours and must retain at least 10,000 residents. The factory menu shows the exact population cost."]
  },
  {
    createdAt: 1792870664672, // Date.now() captured once when this entry was created.
    introducedIn: "2026.10.24.1",
    title: "Towns and their support buildings now form connected districts",
    why: "Town industries and services now share a consistent architectural style and show which town they serve.",
    changes: [
      "Support buildings and Project preparations have been remodeled on matching marble platforms, with shared brass detailing and distinct machinery.",
      "Service connections follow the town's actual support assignments, including second-ring plots, terrain and overlapping towns. Connections are visual and do not change building costs or bonuses.",
      "The 2D fallback has matching building artwork and service links. Construction, inactive buildings and existing saved structures retain their normal behavior."
    ]
  },
  ...WAR_INDUSTRY_SQUADS_CHANGELOG,
  ...FORT_WALL_OPENINGS_CHANGELOG,
  ...HILL_GARRISON_FILL_CHANGELOG,
  {
    createdAt: 1792873662311, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.24.3",
    title: "Titanium-armoured soldiers no longer collapse when they move",
    why: "The heavy armour's animations were copied from the standard soldier onto a differently shaped body, so the armour crumpled the moment a soldier ran, stood or knelt.",
    changes: [
      "Soldiers in heavy armour now stand, run, march and kneel with the same poses and arm positions as standard soldiers",
      "This is cosmetic and only shows on the 3D map"
    ]
  },
  {
    createdAt: 1792909803859, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.24.3",
    title: "Soldiers killed in battle now fall properly",
    why: "A soldier killed in a 3D battle was tipped over whole and shrunk, so they sank into a small bundle on the ground instead of falling.",
    changes: [
      "Killed soldiers, in standard or heavy armour, now play a real fall and lie full size on the battlefield",
      "On the 2D map, soldiers killed during a dock landing now fade out over about a second instead of vanishing almost at once"
    ]
  },
  {
    createdAt: 1792854395082, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.relics",
    title: "Concordance relic installations",
    why: "Relics are surviving planetary machinery, with useful installations and finite reserves worth fighting over.",
    changes: ["New planets select seven installation families, represented by weathered ziggurats with House banners. Nearby anonymous light columns and minimap markers guide exploration.", "Garrison relics to use their installations. Combat suits, defensive field cells, ancillary bodies and nanofabrication material have persistent finite reserves; recapture never refills them.", "Capture artwork explains the buried installation and its benefit. Depleted sites remain on the map with an empty-reserve marker. Existing campaigns retain their original wonder rules."]
  },
  ...SHARD_COMEBACK_CHANGELOG,
  {
    createdAt: 1792907228760, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.2",
    title: "Lost towns and docks name who took them",
    why: "A lost town only said \"Lost Aurienspire Ring\", with an unrounded population, and a lost Dock had no note of its own. If the town tile's own record was missing, the siege card could still say your Palisade was holding after it had fallen.",
    changes: [
      "Town cards in Yours say who took the town, or whom you took it from",
      "Town populations on those cards are rounded to whole numbers",
      "Losing or capturing a Dock gets its own note in Yours, naming the other player",
      "A siege on a town or Dock you lost now shows as fallen, even when its tile record is missing"
    ]
  },
  {
    createdAt: 1792869724355, // Date.now() captured once for this entry.
    introducedIn: "2026.10.24.2",
    title: "Troop carriers at dock landings",
    why: "An army crossing the sea should arrive aboard a landing carrier.",
    changes: ["Dock-to-dock attacks now show futuristic carriers sailing in, lowering their bow ramps and unloading infantry into combat. Carriers stay beached until the battle ends, on both 3D and 2D maps."]
  },
  {
    createdAt: 1792907644912, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "No battle sound for undefended frontier",
    why: "Tapping a frontier tile being taken played the clash of regiments, even though no troops stand on frontier ground to fight.",
    changes: ["Tapping a frontier tile under attack only plays the battle sound while a garrison is holding it. Attacks on settled land still sound as before"]
  },
  {
    createdAt: 1792909372604, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "More useful sync-delay debug logs",
    why: "Debug downloads could confirm delayed attacks but failed to collect the server evidence needed to explain them.",
    changes: ["Debug downloads now collect authenticated diagnostics for your own commands, actual network send timings, browser stalls, recent sync-warning windows and disconnect details."]
  },
  {
    createdAt: 1792909218843, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Weapons Factory bonus needs a factory",
    why: "An empire with no Weapons Factories still got +100% attack against anyone missing one, which cancelled out the edge a real factory owner had over it.",
    changes: [
      "The +100% war-industry bonus now applies only for a Weapons Factory type you own and your opponent lacks",
      "Its win-chance row names just those types, e.g. \"Attacker missing Titanium Weapons Factory\"",
      "Two empires with no Weapons Factories get no bonus either way"
    ]
  },
  {
    createdAt: 1792929923604, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Sieges say when your defenses fell",
    why: "A Palisade taken without one of the siege's own assaults winning, such as by a Breakthrough, still read \"Your Palisade is holding\", with the loss shown as a separate tile row.",
    changes: [
      "A siege on a tile you then lost now shows that it fell and who took it, even when the final blow came another way",
      "Fallen sieges read \"Held off 2 assaults before it fell · Kara spent 300 manpower attacking it\"",
      "Yours names barbarians as Planetary Defense instead of their internal id"
    ]
  },
  {
    createdAt: 1792908043500, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Encirclement works for large empires",
    why: "Once an empire grew past roughly 1,800 connected tiles, the supply check gave up before it finished. Frontier cut off from supply, for example behind an origin lost to a counter-attack, stayed owned when it should have been lost.",
    changes: [
      "The supply check now looks only at your frontier, not your whole empire, so large empires lose cut-off frontier immediately",
      "This applies to captures, lost attack origins and abilities that remove tiles"
    ]
  },
  {
    createdAt: 1792930581798, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Distinct advanced support structures",
    why: "Similar building shapes made support structures hard to identify at a glance.",
    changes: ["Support structures now have distinct silhouettes and specialized machinery, with refined metal, ceramic and aether details suited to the Empire’s advanced technology.", "High-yield plants have larger signature assemblies, and map and menu artwork match the new models."]
  },
  {
    createdAt: 1792931842668, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Correct population-building descriptions",
    why: "Incubation Engine information still described a retired food effect, while Census Hall listed an outdated growth bonus.",
    changes: ["Incubation Engine now correctly states +10,000 population on completion and +10% ongoing growth. Census Hall describes its population-capacity and town-upgrade benefits. These descriptions use the same shared constants as the game rules."]
  },
  {
    createdAt: 1792944374596, // Date.now() captured once for this entry.
    introducedIn: "2026.10.25.1",
    title: "Verified structure identities",
    why: "Some structure descriptions still quoted retired rules and previews showed superseded artwork.",
    changes: ["Structure information now shares canonical names and verified roles with the 3D review. Thunder Bastion and Ancillary Depot descriptions reflect current rules; retired structures are labelled clearly.", "The completed Sovereign Siege Engine now includes its long barrel, power core and targeting assembly, with matching 2D artwork."]
  }
];

const latestCreatedAt = Math.max(...ALL_CLIENT_CHANGELOG_ENTRIES.map((entry) => entry.createdAt));
const oldestAllowedAt = latestCreatedAt - 6 * 24 * 60 * 60 * 1000;

export const CLIENT_CHANGELOG_ENTRIES = ALL_CLIENT_CHANGELOG_ENTRIES.filter(
  (entry) => entry.createdAt >= oldestAllowedAt
);
