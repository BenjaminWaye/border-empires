import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { PHONE_LAYOUT_FIXES_ENTRY } from "./client-changelog-phone-layout-fixes.js";
import { GUIDE_PLAYTEST_FIXES_ENTRY } from "./client-changelog-guide-playtest-fixes.js";
import { GUIDE_MANIFEST_PRICE_ENTRY } from "./client-changelog-guide-manifest-price.js";
import { TOWN_RING_GARRISON_ENTRY } from "./client-changelog-town-ring-garrison.js";
import { ABANDON_CONFIRM_ENTRY } from "./client-changelog-abandon-confirm.js";
import { TOWN_PLACE_NEEDS_PLOT_ENTRY } from "./client-changelog-town-place-needs-plot.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_116: ClientChangelogEntry[] = [
  { ...PHONE_LAYOUT_FIXES_ENTRY, createdAt: 1794563191075, },
  { ...GUIDE_PLAYTEST_FIXES_ENTRY, createdAt: 1794561799617, },
  { ...GUIDE_MANIFEST_PRICE_ENTRY, createdAt: 1794580736251, },
  { ...TOWN_RING_GARRISON_ENTRY, createdAt: 1794590298990, },
  { ...ABANDON_CONFIRM_ENTRY, createdAt: 1794635358149, },
  { ...TOWN_PLACE_NEEDS_PLOT_ENTRY, createdAt: 1794635077747, },
];
