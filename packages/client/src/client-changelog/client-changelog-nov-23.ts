// 2026.11.23 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { TRUCE_CLOCK_FROM_OFFER_ENTRY } from "./client-changelog-truce-clock-from-offer.js";

export const NOV_23_CHANGELOG: ClientChangelogEntry[] = [
  { ...TRUCE_CLOCK_FROM_OFFER_ENTRY, createdAt: 1795425750299, },
];
