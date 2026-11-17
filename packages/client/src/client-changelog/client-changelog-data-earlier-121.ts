import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { FASTER_LOGIN_MAP_ENTRY } from "./client-changelog-faster-login-map.js";
import { SCOUT_DRONE_REDESIGN_ENTRY } from "./client-changelog-explore-scout-drones.js";
import { DISTRICT_FLAT_ART_OVER_3D_ENTRY } from "./client-changelog-district-3d-art.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_121: ClientChangelogEntry[] = [
  { ...FASTER_LOGIN_MAP_ENTRY, createdAt: 1794856144245, },
  { ...SCOUT_DRONE_REDESIGN_ENTRY, createdAt: 1794695503609, },
  { ...DISTRICT_FLAT_ART_OVER_3D_ENTRY, createdAt: 1794863250098, },
];
