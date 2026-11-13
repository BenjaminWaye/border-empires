import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { PHONE_LAYOUT_FIXES_ENTRY } from "./client-changelog-phone-layout-fixes.js";
import { GUIDE_PLAYTEST_FIXES_ENTRY } from "./client-changelog-guide-playtest-fixes.js";
import { GUIDE_MANIFEST_PRICE_ENTRY } from "./client-changelog-guide-manifest-price.js";
import { IMPERIAL_WARD_REMOVED_ENTRY } from "./client-changelog-imperial-ward-removed.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_116: ClientChangelogEntry[] = [
  { ...PHONE_LAYOUT_FIXES_ENTRY, createdAt: 1794563191075, },
  { ...GUIDE_PLAYTEST_FIXES_ENTRY, createdAt: 1794561799617, },
  { ...GUIDE_MANIFEST_PRICE_ENTRY, createdAt: 1794580736251, },
  { ...IMPERIAL_WARD_REMOVED_ENTRY, createdAt: 1794590558028, },
];
