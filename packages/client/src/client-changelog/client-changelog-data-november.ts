import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AETHER_TOWER_SHOTS_CHANGELOG } from "./client-changelog-aether-tower-shots.js";
import { LEGAL_PAGES_CHANGELOG } from "./client-changelog-legal-pages.js";
import { CAPTURE_AFTERMATH_CHANGELOG } from "./client-changelog-capture-aftermath.js";
import { AI_STACKED_INDUSTRY_CHANGELOG } from "./client-changelog-ai-stacked-industry.js";

// November 2026 topic files, grouped so client-changelog-data.ts stays under
// the 500-line limit. Add new per-topic imports here, not there.
export const NOVEMBER_CHANGELOG: ClientChangelogEntry[] = [
  ...AETHER_TOWER_SHOTS_CHANGELOG,
  ...LEGAL_PAGES_CHANGELOG,
  ...CAPTURE_AFTERMATH_CHANGELOG,
  ...AI_STACKED_INDUSTRY_CHANGELOG
];
