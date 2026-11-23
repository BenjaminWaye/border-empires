// 2026.11.21-23 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { TIP_PINS_ENTRY } from "./client-changelog-tip-pins.js";
import { THREE_SEATS_MAP_ENTRY } from "./client-changelog-three-seats-map.js";
import { OLD_ALLIANCES_PANEL_REMOVED_ENTRY } from "./client-changelog-old-alliances-panel-removed.js";
import { UNSETTLED_ENCIRCLEMENT_ENTRY } from "./client-changelog-unsettled-encirclement.js";

export const NOV_21_23_CHANGELOG: ClientChangelogEntry[] = [
  { ...TIP_PINS_ENTRY, createdAt: 1795294290244 },
  { ...THREE_SEATS_MAP_ENTRY, createdAt: 1795296228795 },
  { ...OLD_ALLIANCES_PANEL_REMOVED_ENTRY, createdAt: 1795296477203 },
  { ...UNSETTLED_ENCIRCLEMENT_ENTRY, createdAt: 1795418149833 },
];
