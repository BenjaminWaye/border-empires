// Entries from 27-28 Nov 2026, split out of client-changelog-data.ts (500-line limit, AGENTS.md).
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { QUIET_GOOD_NEWS_ENTRY } from "./client-changelog-quiet-good-news.js";
import { CHRONICLE_OPENS_YOURS_ENTRY } from "./client-changelog-chronicle-opens-yours.js";
import { GUIDE_ISLAND_DOCK_ENTRY } from "./client-changelog-guide-island-dock.js";
import { INSURGENTS_ENTRY } from "./client-changelog-insurgents.js";
import { ATTACK_EN_ROUTE_ENTRY } from "./client-changelog-attack-en-route.js";
import { SETTINGS_MENU_TIDY_ENTRY } from "./client-changelog-settings-menu-tidy.js";
import { ANALYTICS_CONSENT_ENTRY } from "./client-changelog-analytics-consent.js";

export const NOV_27_28_CHANGELOG: ClientChangelogEntry[] = [
  { ...QUIET_GOOD_NEWS_ENTRY, createdAt: 1795724321729, },
  { ...CHRONICLE_OPENS_YOURS_ENTRY, createdAt: 1795724340365, },
  { ...GUIDE_ISLAND_DOCK_ENTRY, createdAt: 1795779416929, },
  { ...ATTACK_EN_ROUTE_ENTRY, createdAt: 1795779638841, },
  { ...INSURGENTS_ENTRY, createdAt: 1795780690085, },
  { ...SETTINGS_MENU_TIDY_ENTRY, createdAt: 1795792563517, },
  { ...ANALYTICS_CONSENT_ENTRY, createdAt: 1795825991167, },
];
