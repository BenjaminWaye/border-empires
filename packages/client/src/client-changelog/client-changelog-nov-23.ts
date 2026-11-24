// 2026.11.23 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { VISIT_FORECAST_ENTRY } from "./client-changelog-visit-forecast.js";
import { VISIT_AGENDA_ENTRY } from "./client-changelog-visit-agenda.js";
import { GUIDE_PLAIN_WORDS_ENTRY } from "./client-changelog-guide-plain-words.js";
import { AI_ALLIANCE_STRENGTH_ENTRY } from "./client-changelog-ai-alliance-strength.js";
import { EXPAND_ATTACK_CONFIRM_ENTRY } from "./client-changelog-expand-attack-confirm.js";
import { INTEGRITY_OWN_LAND_ENTRY } from "./client-changelog-integrity-own-land.js";
import { DOCK_CROSS_SEA_ENTRY } from "./client-changelog-dock-cross-sea.js";
import { TRUCE_CLOCK_FROM_OFFER_ENTRY } from "./client-changelog-truce-clock-from-offer.js";
import { SCOUT_SHORTEST_HOME_ENTRY } from "./client-changelog-scout-shortest-home.js";
import { UNSETTLED_ENCIRCLEMENT_ENTRY } from "./client-changelog-unsettled-encirclement.js";
import { RUN4_QUICK_FIXES_ENTRY } from "./client-changelog-run4-quick-fixes.js";
import { CAPTURED_TOWN_FIST_ENTRY } from "./client-changelog-captured-town-fist.js";
import { UMBRITE_FOREST_DEPOSITS_ENTRY } from "./client-changelog-umbrite-forest-deposits.js";
import { PD_LAND_VISIBLE_ENTRY } from "./client-changelog-pd-land-visible.js";
import { LOST_TILE_OWNER_ENTRY } from "./client-changelog-lost-tile-owner.js";
import { CHRONICLE_ROW_TIME_ENTRY } from "./client-changelog-chronicle-row-time.js";
import { VISIT_REPORT_ENTRY } from "./client-changelog-visit-report.js";
import { PUBLIC_HOUSE_PROFILE_ENTRY } from "./client-changelog-public-house-profile.js";
import { SEASON_AWARDS_ENTRY } from "./client-changelog-season-awards.js";
import { SCOUT_HIDDEN_BORDER_ENTRY } from "./client-changelog-scout-hidden-border.js";

export const NOV_23_CHANGELOG: ClientChangelogEntry[] = [
  { ...SEASON_AWARDS_ENTRY, createdAt: 1795469520596, },
  { ...PUBLIC_HOUSE_PROFILE_ENTRY, createdAt: 1795468951720, },
  { ...VISIT_AGENDA_ENTRY, createdAt: 1795459779781, },
  { ...VISIT_FORECAST_ENTRY, createdAt: 1795459490383, },
  { ...TRUCE_CLOCK_FROM_OFFER_ENTRY, createdAt: 1795425750299, },
  { ...SCOUT_SHORTEST_HOME_ENTRY, createdAt: 1795418080546, },
  { ...UNSETTLED_ENCIRCLEMENT_ENTRY, createdAt: 1795418149833, },
  { ...RUN4_QUICK_FIXES_ENTRY, createdAt: 1795422082667, },
  { ...CAPTURED_TOWN_FIST_ENTRY, createdAt: 1795424975001, },
  { ...UMBRITE_FOREST_DEPOSITS_ENTRY, createdAt: 1795425803985, },
  { ...PD_LAND_VISIBLE_ENTRY, createdAt: 1795437513917, },
  { ...LOST_TILE_OWNER_ENTRY, createdAt: 1795441816662, },
  { ...VISIT_REPORT_ENTRY, createdAt: 1795448790974, },
  { ...DOCK_CROSS_SEA_ENTRY, createdAt: 1795447943074, },
  { ...CHRONICLE_ROW_TIME_ENTRY, createdAt: 1795466612442, },
  { ...GUIDE_PLAIN_WORDS_ENTRY, createdAt: 1795468127235, },
  { ...AI_ALLIANCE_STRENGTH_ENTRY, createdAt: 1795468439390, },
  { ...INTEGRITY_OWN_LAND_ENTRY, createdAt: 1795527054636, },
  { ...EXPAND_ATTACK_CONFIRM_ENTRY, createdAt: 1795527179362, },
  { ...SCOUT_HIDDEN_BORDER_ENTRY, createdAt: 1795556109834, },
];
