import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AFC_LANDING_DEPLOYMENT_ENTRY } from "./client-changelog-afc-hill-cut.js";
import { RESOURCE_LENS_ENTRY } from "./client-changelog-map-lens.js";
import { WAYSTATION_FORT_MODULE_ENTRY } from "./client-changelog-waystation-fort-module.js";
import { READABLE_REALM_NAMES_ENTRY } from "./client-changelog-readable-realm-names.js";
import { MUSTER_DOCK_TRANSPORT_ENTRY } from "./client-changelog-muster-dock-transport.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_112: ClientChangelogEntry[] = [
  { ...AFC_LANDING_DEPLOYMENT_ENTRY, createdAt: 1794342682675, },
  { ...RESOURCE_LENS_ENTRY, createdAt: 1794383695242, },
  { ...WAYSTATION_FORT_MODULE_ENTRY, createdAt: 1794394297385, },
  { ...READABLE_REALM_NAMES_ENTRY, createdAt: 1794410558462, },
  { ...MUSTER_DOCK_TRANSPORT_ENTRY, createdAt: 1794353510194, },
];
