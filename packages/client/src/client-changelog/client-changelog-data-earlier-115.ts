import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { CAMERA_PER_ACCOUNT_ENTRY } from "./client-changelog-nov-11.js";
import { WAYSTATION_LANDING_CLEAR_ENTRY } from "./client-changelog-waystation-landing-clear.js";
import { PLACE_FEEDBACK_ENTRY } from "./client-changelog-place-feedback.js";
import { AETHER_PURGE_RAZES_BEACON_ENTRY } from "./client-changelog-aether-purge-razes-beacon.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_115: ClientChangelogEntry[] = [
  { ...WAYSTATION_LANDING_CLEAR_ENTRY, createdAt: 1794433771738, },
  { ...CAMERA_PER_ACCOUNT_ENTRY, createdAt: 1794432604008, },
  { ...PLACE_FEEDBACK_ENTRY, createdAt: 1794410576432, },
  { ...AETHER_PURGE_RAZES_BEACON_ENTRY, createdAt: 1794436718206, },
];
