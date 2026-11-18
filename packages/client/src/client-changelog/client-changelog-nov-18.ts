// 2026.11.18 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { HILL_FOG_SEAMS_ENTRY } from "./client-changelog-hill-fog-seams.js";
import { HUD_NEXT_STEPS_ENTRY } from "./client-changelog-hud-next-steps.js";
import { GUIDE_EVERY_SEASON_ENTRY } from "./client-changelog-guide-every-season.js";
import { PANEL_LAYOUT_DATA_ENTRY } from "./client-changelog-panel-layout-data.js";
import { TAP_SELECT_CONFIRM_ENTRY } from "./client-changelog-tap-select-confirm.js";
import { REACH_BUILD_FIXES_ENTRY } from "./client-changelog-reach-build-fixes.js";
import { AFC_SCOUT_BUTTON_ENTRY } from "./client-changelog-afc-scout-button.js";
import { WAYSTATION_SURVEY_RIG_ENTRY } from "./client-changelog-waystation-survey-rig.js";
import { TOWN_PLOT_MARKERS_ENTRY } from "./client-changelog-town-plot-markers.js";
import { FARM_PLOT_ENTRY } from "./client-changelog-farm-plot.js";
import { LOGIN_LORE_QUOTES_ENTRY } from "./client-changelog-login-lore-quotes.js";
import { CHARGE_SEARCH_CIRCLES_ENTRY } from "./client-changelog-charge-search-circles.js";
import { CORRECTION_CHARGES_ENTRY } from "./client-changelog-correction-charges.js";
import { EXPAND_CONFIRM_DOCK_ENTRY } from "./client-changelog-expand-confirm-dock.js";
import { GUIDE_AFTER_MAP_LOAD_ENTRY } from "./client-changelog-guide-after-map-load.js";

export const NOV_18_CHANGELOG: ClientChangelogEntry[] = [
  { ...HILL_FOG_SEAMS_ENTRY, createdAt: 1794989604778, },
  { ...HUD_NEXT_STEPS_ENTRY, createdAt: 1794999401321, },
  { ...GUIDE_EVERY_SEASON_ENTRY, createdAt: 1794999821162, },
  { ...PANEL_LAYOUT_DATA_ENTRY, createdAt: 1795000155417, },
  { ...TAP_SELECT_CONFIRM_ENTRY, createdAt: 1794999702919, },
  { ...REACH_BUILD_FIXES_ENTRY, createdAt: 1794999694412, },
  { ...AFC_SCOUT_BUTTON_ENTRY, createdAt: 1795002703488, },
  TOWN_PLOT_MARKERS_ENTRY,
  WAYSTATION_SURVEY_RIG_ENTRY,
  { ...FARM_PLOT_ENTRY, createdAt: 1795005541792, },
  { ...LOGIN_LORE_QUOTES_ENTRY, createdAt: 1795004512423, },
  { ...CHARGE_SEARCH_CIRCLES_ENTRY, createdAt: 1794988683730, },
  { ...CORRECTION_CHARGES_ENTRY, createdAt: 1795020091328, },
  { ...EXPAND_CONFIRM_DOCK_ENTRY, createdAt: 1795027635298, },
  { ...GUIDE_AFTER_MAP_LOAD_ENTRY, createdAt: 1795033635525, },
];
