// 2026.11.14 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AFC_TILE_BAR_ENTRY } from "./client-changelog-afc-tile-bar.js";
import { PLACEMENT_CONFIRM_PHONE_ENTRY } from "./client-changelog-placement-confirm-phone.js";

export const NOV_14_CHANGELOG: ClientChangelogEntry[] = [
  { ...AFC_TILE_BAR_ENTRY, createdAt: 1794679282177 },
  { ...PLACEMENT_CONFIRM_PHONE_ENTRY, createdAt: 1794695838615 }
];
