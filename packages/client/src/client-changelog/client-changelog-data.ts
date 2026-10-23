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
import { CAPTURE_HOLD_EFFORT_CHANGELOG } from "./client-changelog-capture-hold-effort.js";
import { HETZNER_CLIENT_HOSTING_CHANGELOG } from "./client-changelog-hetzner-client-hosting.js";
import { AI_DEAL_SUGGEST_CHANGELOG } from "./client-changelog-ai-deal-suggest.js";
import { TOWN_MARBLE_CHANGELOG } from "./client-changelog-town-marble.js";
import { SIEGE_REPORTS_CHANGELOG } from "./client-changelog-siege-reports.js";
import { RICHER_FORESTS_CHANGELOG } from "./client-changelog-richer-forests.js";
import { SIEGE_FX_GATE_CHANGELOG } from "./client-changelog-siege-fx-gate.js";
import { INCURSION_HATCH_HILLS_CHANGELOG } from "./client-changelog-incursion-hatch-hills.js";
import { MARCH_ACROSS_WATER_CHANGELOG } from "./client-changelog-march-across-water.js";
import { RECONNECT_NO_AUTH_CHANGELOG } from "./client-changelog-reconnect-no-auth.js";
import { PLANETARY_DEFENSE_MUSTER_FLAG_CHANGELOG } from "./client-changelog-planetary-defense-muster-flag.js";
import { YOURS_TILE_COORDS_CHANGELOG } from "./client-changelog-yours-tile-coords.js";
import { MAP_NAMES_CHANGELOG } from "./client-changelog-map-names.js";
import { REACH_OWNER_NAME_CHANGELOG } from "./client-changelog-reach-owner-name.js";
import { ACTIVITY_RESTART_WINDOW_CHANGELOG } from "./client-changelog-activity-restart-window.js";
import { FOGGED_MIST_FEATURES_CHANGELOG } from "./client-changelog-fogged-mist-features.js";
import { EXPIRED_TRUCE_OFFERS_CHANGELOG } from "./client-changelog-expired-truce-offers.js";
import { LOST_STRUCTURES_CHANGELOG } from "./client-changelog-lost-structures.js";
import { CAPTURED_MUSTER_CLEAR_CHANGELOG } from "./client-changelog-captured-muster-clear.js";
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
  ...AUTO_GARRISON_REQUEUE_CHANGELOG,
  ...MANPOWER_BATCH_LABEL_CHANGELOG,
  ...RESTART_TILE_STATE_CHANGELOG,
  ...RESTART_MANPOWER_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_LOADING,
  ...CLIENT_CHANGELOG_ENTRIES_TOWN_GROWTH_WAR_INTEGRITY,
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
  ...AFC_MODULE_TAB_CHANGELOG,
  ...CLIENT_CHANGELOG_ENTRIES_WAYSTATION_AUTO_CLAIM_ACTIVATION,
  ...CLIENT_CHANGELOG_ENTRIES_OCT_12,
  ...CLIENT_CHANGELOG_ENTRIES_AFC_HILL_CUT,
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
  ...RECONNECT_NO_AUTH_CHANGELOG,
  ...PLANETARY_DEFENSE_MUSTER_FLAG_CHANGELOG,
  ...YOURS_TILE_COORDS_CHANGELOG,
  ...MAP_NAMES_CHANGELOG,
  ...REACH_OWNER_NAME_CHANGELOG,
  ...ACTIVITY_RESTART_WINDOW_CHANGELOG,
  ...FOGGED_MIST_FEATURES_CHANGELOG,
  ...EXPIRED_TRUCE_OFFERS_CHANGELOG,
  ...LOST_STRUCTURES_CHANGELOG,
  ...CAPTURED_MUSTER_CLEAR_CHANGELOG
];

const latestCreatedAt = Math.max(...ALL_CLIENT_CHANGELOG_ENTRIES.map((entry) => entry.createdAt));
const oldestAllowedAt = latestCreatedAt - 6 * 24 * 60 * 60 * 1000;

export const CLIENT_CHANGELOG_ENTRIES = ALL_CLIENT_CHANGELOG_ENTRIES.filter(
  (entry) => entry.createdAt >= oldestAllowedAt
);
