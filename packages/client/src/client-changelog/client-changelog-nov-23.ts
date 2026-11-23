// 2026.11.23 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { THREE_SEATS_MAP_ENTRY } from "./client-changelog-three-seats-map.js";
import { OLD_ALLIANCES_PANEL_REMOVED_ENTRY } from "./client-changelog-old-alliances-panel-removed.js";
import { WAYSTATION_VISION_LOOK_ENTRY } from "./client-changelog-waystation-vision-look.js";

export const NOV_23_CHANGELOG: ClientChangelogEntry[] = [
  { ...THREE_SEATS_MAP_ENTRY, createdAt: 1795296228795 },
  { ...OLD_ALLIANCES_PANEL_REMOVED_ENTRY, createdAt: 1795296477203 },
  { ...WAYSTATION_VISION_LOOK_ENTRY, createdAt: 1795425562647 }
];
