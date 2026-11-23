// 2026.11.21 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { INCUBATION_ENGINE_BURST_ENTRY } from "./client-changelog-incubation-engine-burst.js";
import { REPORT_BUG_BUTTONS_ENTRY } from "./client-changelog-report-bug-buttons.js";
import { TIP_OVER_DRONE_PILL_ENTRY } from "./client-changelog-tip-over-drone-pill.js";
import { GUIDE_LAUNCHER_SCOUT_ENTRY } from "./client-changelog-guide-launcher-scout.js";
import { CHARGE_CARDS_POLISH_ENTRY } from "./client-changelog-charge-cards-polish.js";
import { ENCIRCLEMENT_EMPIRE_FELL_ENTRY } from "./client-changelog-encirclement-empire-fell.js";
import { GUIDE_MUSTER_HIGHLIGHT_ENTRY } from "./client-changelog-guide-muster-highlight.js";
import { CAPTURE_GARRISON_PROMPT_ENTRY } from "./client-changelog-capture-garrison-prompt.js";
import { TIP_PINS_ENTRY } from "./client-changelog-tip-pins.js";
import { THREE_SEATS_MAP_ENTRY } from "./client-changelog-three-seats-map.js";
import { OLD_ALLIANCES_PANEL_REMOVED_ENTRY } from "./client-changelog-old-alliances-panel-removed.js";
import { SCOUT_STOP_TAPS_ENTRY } from "./client-changelog-scout-stop-taps.js";

export const NOV_21_CHANGELOG: ClientChangelogEntry[] = [
  { ...INCUBATION_ENGINE_BURST_ENTRY, createdAt: 1795257240525, },
  { ...REPORT_BUG_BUTTONS_ENTRY, createdAt: 1795258066508, },
  { ...TIP_OVER_DRONE_PILL_ENTRY, createdAt: 1795288791904, },
  { ...GUIDE_LAUNCHER_SCOUT_ENTRY, createdAt: 1795288846909, },
  { ...CHARGE_CARDS_POLISH_ENTRY, createdAt: 1795293780521, },
  { ...ENCIRCLEMENT_EMPIRE_FELL_ENTRY, createdAt: 1795291759105, },
  { ...GUIDE_MUSTER_HIGHLIGHT_ENTRY, createdAt: 1795293709185, },
  { ...CAPTURE_GARRISON_PROMPT_ENTRY, createdAt: 1795294115079, },
  { ...TIP_PINS_ENTRY, createdAt: 1795294290244, },
  { ...THREE_SEATS_MAP_ENTRY, createdAt: 1795296228795, },
  { ...OLD_ALLIANCES_PANEL_REMOVED_ENTRY, createdAt: 1795296477203, },
  { ...SCOUT_STOP_TAPS_ENTRY, createdAt: 1795294345014, },
];
