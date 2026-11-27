// Entries from 27-28 Nov 2026, split out of client-changelog-data.ts (500-line limit, AGENTS.md).
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { INSURGENTS_ENTRY } from "./client-changelog-insurgents.js";
import { SETTINGS_MENU_TIDY_ENTRY } from "./client-changelog-settings-menu-tidy.js";
import { EXPLORE_CAMP_LEAD_ENTRY } from "./client-changelog-explore-camp-lead.js";

export const NOV_27_28_CHANGELOG: ClientChangelogEntry[] = [
  { ...INSURGENTS_ENTRY, createdAt: 1795780690085, },
  { ...SETTINGS_MENU_TIDY_ENTRY, createdAt: 1795792563517, },
  { ...EXPLORE_CAMP_LEAD_ENTRY, createdAt: 1795823532423, },
];
