import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { SHOW_EMPIRE_ON_MAP_ENTRY } from "./client-changelog-show-empire-on-map.js";
import { EXPLORE_SCOUT_DRONES_ENTRY } from "./client-changelog-explore-scout-drones.js";
import { PHOTO_MODE_FINDABLE_ENTRY } from "./client-changelog-photo-mode-findable.js";
import { CAPTURE_DURING_DEAL_ENTRY } from "./client-changelog-capture-during-deal.js";
import { CLARITY_HINTS_ENTRY } from "./client-changelog-clarity-hints.js";
import { ACTION_FEEDBACK_ENTRY } from "./client-changelog-action-feedback.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_118: ClientChangelogEntry[] = [
  { ...EXPLORE_SCOUT_DRONES_ENTRY, createdAt: 1794656611441, },
  { ...SHOW_EMPIRE_ON_MAP_ENTRY, createdAt: 1794656750720, },
  { ...PHOTO_MODE_FINDABLE_ENTRY, createdAt: 1794697190181, },
  { ...CAPTURE_DURING_DEAL_ENTRY, createdAt: 1794696963679, },
  { ...CLARITY_HINTS_ENTRY, createdAt: 1794696879817, },
  { ...ACTION_FEEDBACK_ENTRY, createdAt: 1794695682854, },
];
