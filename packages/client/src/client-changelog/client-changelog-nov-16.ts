// 2026.11.16 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { FORT_BUILDING_SIZE_ENTRY } from "./client-changelog-fort-building-size.js";
import { SALVAGE_TRIBUTE_BALANCE_ENTRY } from "./client-changelog-salvage-tribute-balance.js";
import { SERVER_EXPLORED_MAP_ENTRY } from "./client-changelog-server-explored-map.js";
import { RECONNECT_RAZED_STRUCTURES_ENTRY } from "./client-changelog-reconnect-razed-structures.js";
import { FASTER_LOGIN_MAP_ENTRY } from "./client-changelog-faster-login-map.js";
import { DISTRICT_FLAT_ART_OVER_3D_ENTRY } from "./client-changelog-district-3d-art.js";
import { SALVAGE_TOAST_DECLUTTER_ENTRY } from "./client-changelog-salvage-tribute-balance.js";
import { PLACE_ANOTHER_ENTRY } from "./client-changelog-place-another.js";
import { TRUCE_ENDING_WARNING_ENTRY } from "./client-changelog-truce-ending-warning.js";
import { FORT_ANY_BUILDING_ENTRY } from "./client-changelog-fort-any-building.js";
import { RESOURCE_TRADE_SAFETY_ENTRY } from "./client-changelog-resource-trade-safety.js";
import { TOWNS_LIST_COIN_PENDING_ENTRY } from "./client-changelog-towns-list-coin-pending.js";
import { NO_RATE_LIMIT_ERRORS_ENTRY } from "./client-changelog-no-rate-limit-errors.js";
import { FRONTIER_CLAIM_NEXT_TO_PENDING_ENTRY } from "./client-changelog-frontier-claim-next-to-pending.js";
import { MET_EMPIRES_REMEMBERED_ENTRY } from "./client-changelog-met-empires-remembered.js";
import { AI_COIN_INCOME_ENTRY } from "./client-changelog-ai-coin-income.js";
import { TRUCE_TIME_LEFT_ENTRY } from "./client-changelog-truce-time-left.js";

export const NOV_16_CHANGELOG: ClientChangelogEntry[] = [
  { ...FORT_BUILDING_SIZE_ENTRY, createdAt: 1794863141663 },
  { ...SALVAGE_TRIBUTE_BALANCE_ENTRY, createdAt: 1794828701450 },
  { ...SERVER_EXPLORED_MAP_ENTRY, createdAt: 1794827574814 },
  { ...RECONNECT_RAZED_STRUCTURES_ENTRY, createdAt: 1794830646310 },
  { ...FASTER_LOGIN_MAP_ENTRY, createdAt: 1794856144245 },
  { ...DISTRICT_FLAT_ART_OVER_3D_ENTRY, createdAt: 1794863250098 },
  { ...SALVAGE_TOAST_DECLUTTER_ENTRY, createdAt: 1794863171668 },
  { ...PLACE_ANOTHER_ENTRY, createdAt: 1794861771175 },
  { ...TRUCE_ENDING_WARNING_ENTRY, createdAt: 1794866457428 },
  { ...FORT_ANY_BUILDING_ENTRY, createdAt: 1794864350262 },
  { ...RESOURCE_TRADE_SAFETY_ENTRY, createdAt: 1794863712943 },
  { ...TOWNS_LIST_COIN_PENDING_ENTRY, createdAt: 1794864521632 },
  { ...NO_RATE_LIMIT_ERRORS_ENTRY, createdAt: 1794864645451 },
  { ...FRONTIER_CLAIM_NEXT_TO_PENDING_ENTRY, createdAt: 1794865837776 },
  { ...MET_EMPIRES_REMEMBERED_ENTRY, createdAt: 1794866661803 },
  { ...AI_COIN_INCOME_ENTRY, createdAt: 1794906344491 },
  { ...TRUCE_TIME_LEFT_ENTRY, createdAt: 1794864726014 }
];
