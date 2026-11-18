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
import { LOGIN_LORE_QUOTES_ENTRY } from "./client-changelog-login-lore-quotes.js";

export const NOV_18_CHANGELOG: ClientChangelogEntry[] = [
  { ...HILL_FOG_SEAMS_ENTRY, createdAt: 1794989604778, },
  { ...HUD_NEXT_STEPS_ENTRY, createdAt: 1794999401321, },
  { ...GUIDE_EVERY_SEASON_ENTRY, createdAt: 1794999821162, },
  { ...PANEL_LAYOUT_DATA_ENTRY, createdAt: 1795000155417, },
  { ...TAP_SELECT_CONFIRM_ENTRY, createdAt: 1794999702919, },
  { ...REACH_BUILD_FIXES_ENTRY, createdAt: 1794999694412, },
  { ...AFC_SCOUT_BUTTON_ENTRY, createdAt: 1795002703488, },
  {
    createdAt: 1794998310613,
    introducedIn: "2026.11.18",
    title: "Clearer town building plots",
    why: "Dark hatches around towns looked like objects rather than open building space.",
    changes: [
      "Select your town to see open plots marked by ivory corners and a small brass diamond.",
      "Hover or select a plot to highlight it in amber; markers keep the ground visible in both map renderers.",
      "Occupied plots and enemy land no longer appear as empty building space."
    ]
  },
  WAYSTATION_SURVEY_RIG_ENTRY,
  { ...LOGIN_LORE_QUOTES_ENTRY, createdAt: 1795004512423, },
];
