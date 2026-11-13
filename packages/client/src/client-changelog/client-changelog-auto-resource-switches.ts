import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AUTO_GARRISON_PER_RESOURCE_ENTRY } from "./client-changelog-auto-garrison-per-resource.js";
import { AUTO_IMPROVE_ENTRY } from "./client-changelog-auto-improve.js";

/** Per-resource auto-garrison and auto-improve (2026.11.12). */
export const AUTO_RESOURCE_SWITCHES_CHANGELOG: ClientChangelogEntry[] = [
  { ...AUTO_GARRISON_PER_RESOURCE_ENTRY, createdAt: 1794472982258 },
  { ...AUTO_IMPROVE_ENTRY, createdAt: 1794477276494 }
];
