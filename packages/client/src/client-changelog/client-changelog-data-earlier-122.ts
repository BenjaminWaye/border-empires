import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AFC_LANDING_DEPLOYMENT_ENTRY } from "./client-changelog-afc-hill-cut.js";
import { MINIMAP_WORLD_EDGE_ENTRY, RESOURCE_LENS_ENTRY } from "./client-changelog-map-lens.js";
import { WAYSTATION_FORT_MODULE_ENTRY } from "./client-changelog-waystation-fort-module.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_122: ClientChangelogEntry[] = [
  { ...AFC_LANDING_DEPLOYMENT_ENTRY, createdAt: 1794342682675, },
  { ...RESOURCE_LENS_ENTRY, createdAt: 1794383695242, },
  { ...WAYSTATION_FORT_MODULE_ENTRY, createdAt: 1794394297385, },
  { ...MINIMAP_WORLD_EDGE_ENTRY, createdAt: 1794411491316, },
];
