// Entries from 25-26 Nov 2026, split out of client-changelog-data.ts (500-line limit, AGENTS.md).
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { COLOUR_SETUP_FIXES_ENTRY } from "./client-changelog-colour-setup-fixes.js";
import { MANPOWER_VISIBILITY_ENTRY } from "./client-changelog-manpower-visibility.js";
import { INTEGRITY_EXPLAIN_ENTRY } from "./client-changelog-integrity-explain.js";
import { KEEP_CHARGES_DISABLED_ENTRY } from "./client-changelog-keep-charges-disabled.js";
import { TOWN_PANEL_TIDY_ENTRY } from "./client-changelog-town-panel-tidy.js";
import { GUEST_BADGE_DRONE_ENTRY } from "./client-changelog-guest-badge-drone.js";
import { DEPLOY_SAFE_JOIN_ENTRY } from "./client-changelog-deploy-safe-join.js";
import { DEPLOY_COUNTDOWN_ENTRY } from "./client-changelog-deploy-countdown.js";
import { TOWN_FOCUS_CONFIRM_ENTRY, TOWN_FOCUS_ENTRY, TOWN_FOCUS_LIST_ENTRY, TOWN_FOCUS_PANEL_ENTRY } from "./client-changelog-town-focus.js";
import { UI_TYPE_CONSISTENCY_ENTRY } from "./client-changelog-ui-type-consistency.js";
import { UNLOCK_CELEBRATION_ENTRY } from "./client-changelog-unlock-celebration.js";
import { FRONTIER_GARRISON_ENTRY } from "./client-changelog-frontier-garrison.js";
import { SCOUT_CHARGE_SYNC_ENTRY } from "./client-changelog-scout-charge-sync.js";
import { GUEST_LOGOUT_WARNING_ENTRY } from "./client-changelog-guest-logout-warning.js";
import { PROGRESS_COUNTERS_ENTRY } from "./client-changelog-progress-counters.js";
import { LAUNCH_ATTACK_FLAG_SPOT_ENTRY } from "./client-changelog-launch-attack-flag-spot.js";
import { BEACON_RELAY_WORDING_ENTRY } from "./client-changelog-beacon-relay-wording.js";
import { CHARGE_CARD_TEXT_ENTRY } from "./client-changelog-charge-card-text.js";
import { REGION_CHARGE_PROGRESS_ENTRY } from "./client-changelog-region-charge-progress.js";
import { ACCOUNT_TEXT_FIXES_ENTRY } from "./client-changelog-account-text-fixes.js";
import { EFFORT_ODDS_REFRESH_ENTRY, HUNT_REMOVED_ENTRY } from "./client-changelog-combat-playtest-fixes.js";
import { GUIDE_ATTACK_TRUCE_ENTRY } from "./client-changelog-guide-attack-truce.js";
import { DIPLOMACY_PLAYTEST_FIXES_ENTRY } from "./client-changelog-diplomacy-playtest-fixes.js";
import { TOWN_PLOT_GARRISON_ENTRY } from "./client-changelog-town-plot-garrison.js";
import { DRONE_BORDER_COIN_RESTART_ENTRY } from "./client-changelog-drone-border-coin-restart.js";
import { BATTLE_WARNINGS_ENTRY } from "./client-changelog-battle-warnings.js";
import { PUBLIC_HOUSE_SHARE_STATE_ENTRY } from "./client-changelog-public-house-profile.js";
import { PHONE_OVERLAPS_ENTRY } from "./client-changelog-phone-overlaps.js";
import { TOWN_GROWTH_GARRISON_ENTRY } from "./client-changelog-town-growth-garrison.js";
import { HONEST_JOIN_ENTRY } from "./client-changelog-honest-join.js";
import { FEALTY_WORDING_ENTRY } from "./client-changelog-fealty-wording.js";
import { HOUSE_CRESTS_ENTRY } from "./client-changelog-house-crests.js";
import { HOUSE_CREST_FIXES_ENTRY } from "./client-changelog-house-crest-fixes.js";
import { DISTINCT_EMPIRE_COLOURS_ENTRY } from "./client-changelog-distinct-empire-colours.js";
import { SIEGE_ODDS_ENTRY } from "./client-changelog-siege-odds.js";
import { SIEGE_CUT_OFF_ENTRY } from "./client-changelog-siege-cut-off.js";
import { AI_DEAL_ASKS_ENTRY } from "./client-changelog-ai-deal-asks.js";

import { MOTHERSHIP_AI_ENTRY } from "./client-changelog-mothership-ai.js";
import { TILE_LABELS_R2_ENTRY } from "./client-changelog-tile-labels-r2.js";
import { DRONE_EXPLORE_R3_ENTRY } from "./client-changelog-drone-explore-r3.js";
import { TRUCE_LENGTH_SHOWN_ENTRY } from "./client-changelog-truce-length-shown.js";
import { STRIPED_FRONTIER_ENTRY } from "./client-changelog-striped-frontier.js";
import { GUIDE_PROFILE_R3_ENTRY } from "./client-changelog-guide-profile-r3.js";
import { DIPLOMACY_R3_ENTRY } from "./client-changelog-diplomacy-r3.js";
export const NOV_25_26_CHANGELOG: ClientChangelogEntry[] = [
  { ...KEEP_CHARGES_DISABLED_ENTRY, createdAt: 1795779079188, },
  { ...DEPLOY_SAFE_JOIN_ENTRY, createdAt: 1795620620384, },
  // Out of time order on purpose: kept off the end of the list, where every new entry is appended.
  { ...PUBLIC_HOUSE_SHARE_STATE_ENTRY, createdAt: 1795777142349, },
  { ...DEPLOY_COUNTDOWN_ENTRY, createdAt: 1795627725789, },
  { ...TOWN_FOCUS_ENTRY, createdAt: 1795631183370, },
  { ...UI_TYPE_CONSISTENCY_ENTRY, createdAt: 1795637381397, },
  { ...UNLOCK_CELEBRATION_ENTRY, createdAt: 1795644022855, },
  { ...GUEST_BADGE_DRONE_ENTRY, createdAt: 1795678223664, },
  { ...TOWN_FOCUS_PANEL_ENTRY, createdAt: 1795678750561, },
  { ...FRONTIER_GARRISON_ENTRY, createdAt: 1795692680347, },
  { ...SCOUT_CHARGE_SYNC_ENTRY, createdAt: 1795769841486, },
  { ...TOWN_FOCUS_LIST_ENTRY, createdAt: 1795706978426, },
  { ...GUEST_LOGOUT_WARNING_ENTRY, createdAt: 1795707977072, },
  { ...PROGRESS_COUNTERS_ENTRY, createdAt: 1795721664780, },
  { ...HONEST_JOIN_ENTRY, createdAt: 1795724435038, },
  { ...LAUNCH_ATTACK_FLAG_SPOT_ENTRY, createdAt: 1795724732015, },
  { ...TOWN_FOCUS_CONFIRM_ENTRY, createdAt: 1795724645924, },
  { ...LAUNCH_ATTACK_FLAG_SPOT_ENTRY, createdAt: 1795724732015, },
  { ...BEACON_RELAY_WORDING_ENTRY, createdAt: 1795726388531, },
  { ...MOTHERSHIP_AI_ENTRY, createdAt: 1795769269985, },
  { ...REGION_CHARGE_PROGRESS_ENTRY, createdAt: 1795727660821, },
  { ...CHARGE_CARD_TEXT_ENTRY, createdAt: 1795728906406, },
  { ...GUIDE_ATTACK_TRUCE_ENTRY, createdAt: 1795764700050, },
  { ...DRONE_BORDER_COIN_RESTART_ENTRY, createdAt: 1795765010313, },
  { ...HUNT_REMOVED_ENTRY, createdAt: 1795765029963, },
  { ...EFFORT_ODDS_REFRESH_ENTRY, createdAt: 1795765029964, },
  { ...DIPLOMACY_PLAYTEST_FIXES_ENTRY, createdAt: 1795765266554, },
  { ...PHONE_OVERLAPS_ENTRY, createdAt: 1795765309360, },
  { ...ACCOUNT_TEXT_FIXES_ENTRY, createdAt: 1795765537068, },
  { ...HOUSE_CRESTS_ENTRY, createdAt: 1795769381841, },
  { ...SIEGE_ODDS_ENTRY, createdAt: 1795769624813, },
  { ...BATTLE_WARNINGS_ENTRY, createdAt: 1795769680653, },
  { ...FEALTY_WORDING_ENTRY, createdAt: 1795769738870, },
  { ...TOWN_PLOT_GARRISON_ENTRY, createdAt: 1795776814454, },
  { ...TOWN_PANEL_TIDY_ENTRY, createdAt: 1795776197366, },
  { ...TOWN_GROWTH_GARRISON_ENTRY, createdAt: 1795777090280, },
  { ...AI_DEAL_ASKS_ENTRY, createdAt: 1795779130551, },
  { ...SIEGE_CUT_OFF_ENTRY, createdAt: 1795791221185, },
  { ...HOUSE_CREST_FIXES_ENTRY, createdAt: 1795791560569, },
  { ...TRUCE_LENGTH_SHOWN_ENTRY, createdAt: 1795805060735, },
  { ...TILE_LABELS_R2_ENTRY, createdAt: 1795805295408, },
  { ...INTEGRITY_EXPLAIN_ENTRY, createdAt: 1795805430461, },
  { ...DISTINCT_EMPIRE_COLOURS_ENTRY, createdAt: 1795805465925 },
  { ...STRIPED_FRONTIER_ENTRY, createdAt: 1795814931704 },
  { ...MANPOWER_VISIBILITY_ENTRY, createdAt: 1795816090130 },
  { ...DRONE_EXPLORE_R3_ENTRY, createdAt: 1795816268758 },
  { ...GUIDE_PROFILE_R3_ENTRY, createdAt: 1795816165167 },
  { ...DIPLOMACY_R3_ENTRY, createdAt: 1795816471552 },
  { ...COLOUR_SETUP_FIXES_ENTRY, createdAt: 1795827318288 },
];
