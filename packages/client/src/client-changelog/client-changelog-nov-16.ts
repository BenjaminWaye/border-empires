// 2026.11.16 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AI_COIN_INCOME_ENTRY } from "./client-changelog-ai-coin-income.js";

export const NOV_16_CHANGELOG: ClientChangelogEntry[] = [
  { ...AI_COIN_INCOME_ENTRY, createdAt: 1794865738738 }
];
