// 2026.11.17 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { RETURNING_LOGIN_ENTRY } from "./client-changelog-returning-login.js";
import { CHRONICLE_LOADING_STUCK_ENTRY } from "./client-changelog-chronicle-loading-stuck.js";
import { MANPOWER_COPY_ENTRY } from "./client-changelog-manpower-copy.js";
import { TRUCE_EMAIL_EMPIRE_FELL_ENTRY } from "./client-changelog-truce-email-empire-fell.js";
import { CHRONICLE_HEADLINE_ENTRY } from "./client-changelog-chronicle-headline.js";
import { HYDROWORKS_PLACEMENT_TEXT_ENTRY } from "./client-changelog-hydroworks-placement-text.js";
import { WHOLE_COIN_BALANCE_ENTRY } from "./client-changelog-whole-coin.js";
import { RESOURCE_COUNTER_ENTRY } from "./client-changelog-resource-counter.js";
import { OWN_FORT_TILE_COPY_ENTRY } from "./client-changelog-own-fort-tile-copy.js";
import { HUMAN_TRADE_HOLDINGS_ENTRY } from "./client-changelog-human-trade-holdings.js";
import { DESKTOP_FREE_SLOTS_ENTRY } from "./client-changelog-desktop-free-slots.js";
import { REFINERY_GIVES_ENTRY } from "./client-changelog-refinery-gives.js";
import { MUSTER_CAPTURE_ENTRY } from "./client-changelog-muster-capture.js";
import { TOWN_SCREEN_BIOTA_ENTRY } from "./client-changelog-town-screen-biota.js";
import { TOWN_BAR_STRUCTURE_TOGGLE_ENTRY } from "./client-changelog-town-bar-structure-toggle.js";
import { GUIDE_EXPLORE_ENTRY } from "./client-changelog-guide-explore.js";

export const NOV_17_CHANGELOG: ClientChangelogEntry[] = [
  { ...RETURNING_LOGIN_ENTRY, createdAt: 1794928114737 },
  { ...CHRONICLE_LOADING_STUCK_ENTRY, createdAt: 1794909056601 },
  { ...MANPOWER_COPY_ENTRY, createdAt: 1794931550726 },
  { ...TRUCE_EMAIL_EMPIRE_FELL_ENTRY, createdAt: 1794931727558 },
  { ...CHRONICLE_HEADLINE_ENTRY, createdAt: 1794931506698 },
  { ...HYDROWORKS_PLACEMENT_TEXT_ENTRY, createdAt: 1794944287299 },
  { ...WHOLE_COIN_BALANCE_ENTRY, createdAt: 1794944457814 },
  { ...RESOURCE_COUNTER_ENTRY, createdAt: 1794944628430 },
  { ...OWN_FORT_TILE_COPY_ENTRY, createdAt: 1794950425291 },
  { ...HUMAN_TRADE_HOLDINGS_ENTRY, createdAt: 1794951963573 },
  { ...DESKTOP_FREE_SLOTS_ENTRY, createdAt: 1794951821171 },
  { ...REFINERY_GIVES_ENTRY, createdAt: 1794950469519 },
  { ...MUSTER_CAPTURE_ENTRY, createdAt: 1794949929394 },
  { ...TOWN_SCREEN_BIOTA_ENTRY, createdAt: 1794950085487 },
  { ...TOWN_BAR_STRUCTURE_TOGGLE_ENTRY, createdAt: 1794950483222 },
  { ...GUIDE_EXPLORE_ENTRY, createdAt: 1794951057397 },
];
