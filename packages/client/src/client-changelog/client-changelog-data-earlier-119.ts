import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AUTO_GARRISON_ASK_ENTRY } from "./client-changelog-auto-garrison-ask.js";
import { TOWN_COIN_BLANK_ENTRY } from "./client-changelog-town-coin-blank.js";
import { CLEARER_CAPTURES_ENTRY } from "./client-changelog-clearer-captures.js";
import { MANPOWER_BUILD_TEXT_ENTRY } from "./client-changelog-manpower-build-text.js";
import { OFFER_DOCK_COUNTER_ENTRY } from "./client-changelog-offer-dock-counter.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_119: ClientChangelogEntry[] = [
  { ...AUTO_GARRISON_ASK_ENTRY, createdAt: 1794806556716, },
  { ...TOWN_COIN_BLANK_ENTRY, createdAt: 1794807224989, },
  { ...CLEARER_CAPTURES_ENTRY, createdAt: 1794771007813, },
  { ...MANPOWER_BUILD_TEXT_ENTRY, createdAt: 1794806234122, },
  { ...OFFER_DOCK_COUNTER_ENTRY, createdAt: 1794817332101, },
];
