// The space layer's changelog entries, gathered so the main index carries one
// spread for them (client-changelog-data.ts sits at the line cap).
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { SPACE_BASES_CHANGELOG } from "./client-changelog-space-bases.js";
import { SPACE_DAILY_CHANGELOG } from "./client-changelog-space-daily.js";
import { SPACE_POLITICS_CHANGELOG } from "./client-changelog-space-politics.js";

export const SPACE_CHANGELOG: ClientChangelogEntry[] = [...SPACE_POLITICS_CHANGELOG, ...SPACE_DAILY_CHANGELOG, ...SPACE_BASES_CHANGELOG];
