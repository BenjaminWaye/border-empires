// 2026.11.23 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { DOCK_CROSS_SEA_ENTRY } from "./client-changelog-dock-cross-sea.js";
import { TRUCE_CLOCK_FROM_OFFER_ENTRY } from "./client-changelog-truce-clock-from-offer.js";
import { SCOUT_SHORTEST_HOME_ENTRY } from "./client-changelog-scout-shortest-home.js";
import { UNSETTLED_ENCIRCLEMENT_ENTRY } from "./client-changelog-unsettled-encirclement.js";
import { RUN4_QUICK_FIXES_ENTRY } from "./client-changelog-run4-quick-fixes.js";
import { CAPTURED_TOWN_FIST_ENTRY } from "./client-changelog-captured-town-fist.js";
import { UMBRITE_FOREST_DEPOSITS_ENTRY } from "./client-changelog-umbrite-forest-deposits.js";
import { PD_LAND_VISIBLE_ENTRY } from "./client-changelog-pd-land-visible.js";
import { LOST_TILE_OWNER_ENTRY } from "./client-changelog-lost-tile-owner.js";

export const NOV_23_CHANGELOG: ClientChangelogEntry[] = [
  { ...TRUCE_CLOCK_FROM_OFFER_ENTRY, createdAt: 1795425750299, },
  { ...SCOUT_SHORTEST_HOME_ENTRY, createdAt: 1795418080546, },
  { ...UNSETTLED_ENCIRCLEMENT_ENTRY, createdAt: 1795418149833, },
  { ...RUN4_QUICK_FIXES_ENTRY, createdAt: 1795422082667, },
  { ...CAPTURED_TOWN_FIST_ENTRY, createdAt: 1795424975001, },
  { ...UMBRITE_FOREST_DEPOSITS_ENTRY, createdAt: 1795425803985, },
  { ...PD_LAND_VISIBLE_ENTRY, createdAt: 1795437513917, },
  { ...LOST_TILE_OWNER_ENTRY, createdAt: 1795441816662, },
  { ...DOCK_CROSS_SEA_ENTRY, createdAt: 1795447943074, },
];
