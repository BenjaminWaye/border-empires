import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AUTO_RESOURCE_SWITCHES_CHANGELOG } from "./client-changelog-auto-resource-switches.js";
import { DOCK_ART_ENTRY } from "./client-changelog-dock-art.js";

/** Entries introduced on 2026.11.12. */
export const NOV_12_CHANGELOG: ClientChangelogEntry[] = [
  ...AUTO_RESOURCE_SWITCHES_CHANGELOG,
  { ...DOCK_ART_ENTRY, createdAt: 1794521176798 }
];
