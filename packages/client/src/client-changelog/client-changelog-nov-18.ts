// 2026.11.18 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { HILL_FOG_SEAMS_ENTRY } from "./client-changelog-hill-fog-seams.js";
import { HUD_NEXT_STEPS_ENTRY } from "./client-changelog-hud-next-steps.js";
import { GUIDE_EVERY_SEASON_ENTRY } from "./client-changelog-guide-every-season.js";
import { PANEL_LAYOUT_DATA_ENTRY } from "./client-changelog-panel-layout-data.js";
import { TAP_SELECT_CONFIRM_ENTRY } from "./client-changelog-tap-select-confirm.js";
import { EXPAND_CONFIRM_DOCK_ENTRY } from "./client-changelog-expand-confirm-dock.js";
import { REACH_BUILD_FIXES_ENTRY } from "./client-changelog-reach-build-fixes.js";
import { AFC_SCOUT_BUTTON_ENTRY } from "./client-changelog-afc-scout-button.js";
import { WAYSTATION_SURVEY_RIG_ENTRY } from "./client-changelog-waystation-survey-rig.js";
import { TOWN_PLOT_MARKERS_ENTRY } from "./client-changelog-town-plot-markers.js";
import { FARM_PLOT_ENTRY } from "./client-changelog-farm-plot.js";
import { LOGIN_LORE_QUOTES_ENTRY } from "./client-changelog-login-lore-quotes.js";
import { CHARGE_SEARCH_CIRCLES_ENTRY } from "./client-changelog-charge-search-circles.js";
import { CORRECTION_CHARGES_ENTRY } from "./client-changelog-correction-charges.js";
import { VIVARIUM_ENTRY } from "./client-changelog-vivarium.js";
import { AFC_SUPPORT_TILE_TAP_ENTRY } from "./client-changelog-afc-support-tile-tap.js";
import { THREE_D_TAB_SWITCH_ENTRY } from "./client-changelog-3d-tab-switch.js";
import { TOWN_BAR_BUTTONS_ENTRY } from "./client-changelog-town-bar-buttons.js";
import { GUIDE_AFTER_MAP_LOAD_ENTRY } from "./client-changelog-guide-after-map-load.js";
import { QUIET_LOGIN_CARDS_ENTRY } from "./client-changelog-quiet-login-cards.js";
import { WAYSTATION_OWNED_TOAST_ENTRY } from "./client-changelog-waystation-owned-toast.js";
import { WAYSTATION_HOLO_CRATES_ENTRY } from "./client-changelog-waystation-holo-crates.js";
import { CHRONICLE_SURVEYS_ENTRY } from "./client-changelog-chronicle-surveys.js";
import { STALE_WAYSTATION_CARD_ENTRY } from "./client-changelog-stale-waystation-card.js";
import { LOW_RESOURCE_NEXT_STEPS_ENTRY } from "./client-changelog-low-resource-next-steps.js";
import { SCOUT_RECALL_ENTRY } from "./client-changelog-scout-recall.js";
import { TOWN_PLOT_PICK_ENTRY } from "./client-changelog-town-plot-pick.js";

export const NOV_18_CHANGELOG: ClientChangelogEntry[] = [
  { ...TOWN_PLOT_PICK_ENTRY, createdAt: 1795034895049 },
  { ...HILL_FOG_SEAMS_ENTRY, createdAt: 1794989604778, },
  { ...HUD_NEXT_STEPS_ENTRY, createdAt: 1794999401321, },
  { ...GUIDE_EVERY_SEASON_ENTRY, createdAt: 1794999821162, },
  { ...PANEL_LAYOUT_DATA_ENTRY, createdAt: 1795000155417, },
  { ...TAP_SELECT_CONFIRM_ENTRY, createdAt: 1794999702919, },
  { ...EXPAND_CONFIRM_DOCK_ENTRY, createdAt: 1795027635298, },
  { ...REACH_BUILD_FIXES_ENTRY, createdAt: 1794999694412, },
  { ...AFC_SCOUT_BUTTON_ENTRY, createdAt: 1795002703488, },
  TOWN_PLOT_MARKERS_ENTRY,
  WAYSTATION_SURVEY_RIG_ENTRY,
  { ...FARM_PLOT_ENTRY, createdAt: 1795005541792, },
  { ...LOGIN_LORE_QUOTES_ENTRY, createdAt: 1795004512423, },
  { ...CHARGE_SEARCH_CIRCLES_ENTRY, createdAt: 1794988683730, },
  { ...CORRECTION_CHARGES_ENTRY, createdAt: 1795020091328, },
  { ...VIVARIUM_ENTRY, createdAt: 1795035472775, },
  { ...AFC_SUPPORT_TILE_TAP_ENTRY, createdAt: 1795033573064, },
  { ...THREE_D_TAB_SWITCH_ENTRY, createdAt: 1795033764700, },
  { ...TOWN_BAR_BUTTONS_ENTRY, createdAt: 1795035149737, },
  { ...GUIDE_AFTER_MAP_LOAD_ENTRY, createdAt: 1795033635525, },
  { ...QUIET_LOGIN_CARDS_ENTRY, createdAt: 1795033408340, },
  { ...WAYSTATION_OWNED_TOAST_ENTRY, createdAt: 1795040315805, },
  { ...WAYSTATION_HOLO_CRATES_ENTRY, createdAt: 1795041849825, },
  { ...CHRONICLE_SURVEYS_ENTRY, createdAt: 1795038899676, },
  { ...STALE_WAYSTATION_CARD_ENTRY, createdAt: 1795038774065, },
  { ...LOW_RESOURCE_NEXT_STEPS_ENTRY, createdAt: 1795035489227, },
  { ...SCOUT_RECALL_ENTRY, createdAt: 1795028076014, },
];
