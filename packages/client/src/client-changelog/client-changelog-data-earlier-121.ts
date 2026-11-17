import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { ZOOMED_OUT_PAN_PERF_CHANGELOG } from "./client-changelog-zoomed-out-pan-perf.js";
import { NAVIGATION_LABELS_ENTRY } from "./client-changelog-command-navigation.js";
import { FIRST_DOCK_CARD_ENTRY } from "./client-changelog-first-dock-card.js";
import { WAR_TREE_HIVE_MIND_HUB_ENTRY } from "./client-changelog-nov-09.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_121: ClientChangelogEntry[] = [
  { ...ZOOMED_OUT_PAN_PERF_CHANGELOG, createdAt: 1794216988849, },
  { ...WAR_TREE_HIVE_MIND_HUB_ENTRY, createdAt: 1794292926456, },
  { ...NAVIGATION_LABELS_ENTRY, createdAt: 1794293586587, },
  { ...FIRST_DOCK_CARD_ENTRY, createdAt: 1794657014221, },
];
