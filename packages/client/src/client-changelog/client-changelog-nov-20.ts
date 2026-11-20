// 2026.11.20 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { RETURN_A_TOWN_ENTRY } from "./client-changelog-return-a-town.js";
import { AFC_UPGRADES_BEFORE_MANIFEST_ENTRY } from "./client-changelog-afc-upgrades-before-manifest.js";
import { SCOUT_DRONE_ANY_DISTANCE_ENTRY } from "./client-changelog-scout-drone-any-distance.js";

export const NOV_20_CHANGELOG: ClientChangelogEntry[] = [
  { ...RETURN_A_TOWN_ENTRY, createdAt: 1795153599126, },
  { ...AFC_UPGRADES_BEFORE_MANIFEST_ENTRY, createdAt: 1795160490729 },
  { ...SCOUT_DRONE_ANY_DISTANCE_ENTRY, createdAt: 1795173371678 },
];
