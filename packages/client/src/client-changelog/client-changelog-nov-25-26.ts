// Entries from 25-26 Nov 2026, split out of client-changelog-data.ts (500-line limit, AGENTS.md).
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { TOWN_PANEL_TIDY_ENTRY } from "./client-changelog-town-panel-tidy.js";
import { GUEST_BADGE_DRONE_ENTRY } from "./client-changelog-guest-badge-drone.js";
import { DEPLOY_SAFE_JOIN_ENTRY } from "./client-changelog-deploy-safe-join.js";
import { DEPLOY_COUNTDOWN_ENTRY } from "./client-changelog-deploy-countdown.js";
import { TOWN_FOCUS_CONFIRM_ENTRY, TOWN_FOCUS_ENTRY, TOWN_FOCUS_LIST_ENTRY, TOWN_FOCUS_PANEL_ENTRY } from "./client-changelog-town-focus.js";
import { UI_TYPE_CONSISTENCY_ENTRY } from "./client-changelog-ui-type-consistency.js";
import { UNLOCK_CELEBRATION_ENTRY } from "./client-changelog-unlock-celebration.js";
import { FRONTIER_GARRISON_ENTRY } from "./client-changelog-frontier-garrison.js";
import { GUEST_LOGOUT_WARNING_ENTRY } from "./client-changelog-guest-logout-warning.js";
import { PROGRESS_COUNTERS_ENTRY } from "./client-changelog-progress-counters.js";
import { LAUNCH_ATTACK_FLAG_SPOT_ENTRY } from "./client-changelog-launch-attack-flag-spot.js";
import { BEACON_RELAY_WORDING_ENTRY } from "./client-changelog-beacon-relay-wording.js";
import { REGION_CHARGE_PROGRESS_ENTRY } from "./client-changelog-region-charge-progress.js";
import { GUIDE_ATTACK_TRUCE_ENTRY } from "./client-changelog-guide-attack-truce.js";
import { DIPLOMACY_PLAYTEST_FIXES_ENTRY } from "./client-changelog-diplomacy-playtest-fixes.js";
import { TOWN_PLOT_GARRISON_ENTRY } from "./client-changelog-town-plot-garrison.js";
import { DRONE_BORDER_COIN_RESTART_ENTRY } from "./client-changelog-drone-border-coin-restart.js";
import { PHONE_OVERLAPS_ENTRY } from "./client-changelog-phone-overlaps.js";

export const NOV_25_26_CHANGELOG: ClientChangelogEntry[] = [
  { ...DEPLOY_SAFE_JOIN_ENTRY, createdAt: 1795620620384, },
  { ...DEPLOY_COUNTDOWN_ENTRY, createdAt: 1795627725789, },
  { ...TOWN_FOCUS_ENTRY, createdAt: 1795631183370, },
  { ...UI_TYPE_CONSISTENCY_ENTRY, createdAt: 1795637381397, },
  { ...UNLOCK_CELEBRATION_ENTRY, createdAt: 1795644022855, },
  { ...TOWN_FOCUS_PANEL_ENTRY, createdAt: 1795678750561, },
  { ...GUEST_BADGE_DRONE_ENTRY, createdAt: 1795678223664, },
  { ...FRONTIER_GARRISON_ENTRY, createdAt: 1795692680347, },
  { ...TOWN_FOCUS_LIST_ENTRY, createdAt: 1795706978426, },
  { ...GUEST_LOGOUT_WARNING_ENTRY, createdAt: 1795707977072, },
  { ...PROGRESS_COUNTERS_ENTRY, createdAt: 1795721664780, },
  { ...LAUNCH_ATTACK_FLAG_SPOT_ENTRY, createdAt: 1795724732015, },
  { ...TOWN_FOCUS_CONFIRM_ENTRY, createdAt: 1795724645924, },
  { ...BEACON_RELAY_WORDING_ENTRY, createdAt: 1795726388531, },
  { ...REGION_CHARGE_PROGRESS_ENTRY, createdAt: 1795727660821, },
  { ...GUIDE_ATTACK_TRUCE_ENTRY, createdAt: 1795764700050, },
  { ...DRONE_BORDER_COIN_RESTART_ENTRY, createdAt: 1795765010313, },
  { ...DIPLOMACY_PLAYTEST_FIXES_ENTRY, createdAt: 1795765266554, },
  { ...PHONE_OVERLAPS_ENTRY, createdAt: 1795765309360, },
  { ...TOWN_PLOT_GARRISON_ENTRY, createdAt: 1795776814454, },
  { ...TOWN_PANEL_TIDY_ENTRY, createdAt: 1795776197366, },
];
