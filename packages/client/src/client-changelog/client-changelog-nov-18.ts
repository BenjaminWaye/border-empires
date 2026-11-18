// 2026.11.18 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { CHARGE_SEARCH_CIRCLES_ENTRY } from "./client-changelog-charge-search-circles.js";

export const NOV_18_CHANGELOG: ClientChangelogEntry[] = [
  { ...CHARGE_SEARCH_CIRCLES_ENTRY, createdAt: 1794988683730 }
];
