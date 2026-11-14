import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { CAMERA_PER_ACCOUNT_ENTRY } from "./client-changelog-nov-11.js";
import { WAYSTATION_LANDING_CLEAR_ENTRY } from "./client-changelog-waystation-landing-clear.js";
import { PLACE_FEEDBACK_ENTRY } from "./client-changelog-place-feedback.js";
import { SCIFI_ROADS_ENTRY } from "./client-changelog-scifi-roads.js";
import { STRAIGHT_INTO_CONTEST_ENTRY } from "./client-changelog-straight-into-contest.js";
import { BLOCKED_ACTION_ALERTS_ENTRY } from "./client-changelog-blocked-action-alerts.js";
import { CONSISTENT_NUMBERS_ENTRY } from "./client-changelog-consistent-numbers.js";
import { TAP_TO_INSPECT_ENTRY } from "./client-changelog-tap-to-inspect.js";
import { COMBAT_LEGIBILITY_ENTRY } from "./client-changelog-combat-legibility.js";
import { DIPLOMACY_OFFER_FLOW_ENTRY } from "./client-changelog-diplomacy-offer-flow.js";
import { FOG_GRID_REMOVED_ENTRY } from "./client-changelog-fog-grid-removed.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_115: ClientChangelogEntry[] = [
  { ...WAYSTATION_LANDING_CLEAR_ENTRY, createdAt: 1794433771738, },
  { ...CAMERA_PER_ACCOUNT_ENTRY, createdAt: 1794432604008, },
  { ...PLACE_FEEDBACK_ENTRY, createdAt: 1794410576432, },
  { ...SCIFI_ROADS_ENTRY, createdAt: 1794519394469, },
  { ...STRAIGHT_INTO_CONTEST_ENTRY, createdAt: 1794585503871, },
  { ...BLOCKED_ACTION_ALERTS_ENTRY, createdAt: 1794571774926, },
  { ...CONSISTENT_NUMBERS_ENTRY, createdAt: 1794562088771, },
  { ...TAP_TO_INSPECT_ENTRY, createdAt: 1794561745534, },
  { ...COMBAT_LEGIBILITY_ENTRY, createdAt: 1794561912110, },
  { ...DIPLOMACY_OFFER_FLOW_ENTRY, createdAt: 1794561892577, },
  { ...FOG_GRID_REMOVED_ENTRY, createdAt: 1794598194278, },
];
