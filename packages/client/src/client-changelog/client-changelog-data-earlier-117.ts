import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { NATIVE_SOCIAL_SIGN_IN_ENTRY } from "./client-changelog-nov-10.js";
import { READABLE_REALM_NAMES_ENTRY } from "./client-changelog-readable-realm-names.js";
import { RELIC_REVEAL_ENTRY } from "./client-changelog-relic-reveal.js";
import { NEXT_CONTEST_STARTING_ENTRY } from "./client-changelog-next-contest.js";
import { MUSTER_DOCK_TRANSPORT_ENTRY } from "./client-changelog-muster-dock-transport.js";
import { OWNER_COLOURS_COLOUR_BLIND_ENTRY } from "./client-changelog-owner-colours-colour-blind.js";
import { IMPERIAL_WARD_REMOVED_ENTRY } from "./client-changelog-imperial-ward-removed.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_117: ClientChangelogEntry[] = [
  { ...READABLE_REALM_NAMES_ENTRY, createdAt: 1794410558462, },
  { ...RELIC_REVEAL_ENTRY, createdAt: 1794422720232, },
  { ...NEXT_CONTEST_STARTING_ENTRY, createdAt: 1794380743713, },
  { ...NATIVE_SOCIAL_SIGN_IN_ENTRY, createdAt: 1794288128417, },
  { ...MUSTER_DOCK_TRANSPORT_ENTRY, createdAt: 1794353510194, },
  { ...OWNER_COLOURS_COLOUR_BLIND_ENTRY, createdAt: 1794561750842, },
  { ...IMPERIAL_WARD_REMOVED_ENTRY, createdAt: 1794590558028, },
];
