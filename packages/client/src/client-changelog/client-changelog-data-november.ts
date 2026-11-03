import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { AETHER_TOWER_SHOTS_CHANGELOG } from "./client-changelog-aether-tower-shots.js";
import { LEGAL_PAGES_CHANGELOG } from "./client-changelog-legal-pages.js";
import { CAPTURE_AFTERMATH_CHANGELOG } from "./client-changelog-capture-aftermath.js";
import { SHARDS_REMOVED_CHANGELOG } from "./client-changelog-shards-removed.js";
import { AFC_V3_CHANGELOG } from "./client-changelog-afc-v3.js";
import { AI_STACKED_INDUSTRY_CHANGELOG } from "./client-changelog-ai-stacked-industry.js";
import { HUD_V2_MOBILE_CHANGELOG } from "./client-changelog-hud-v2-mobile.js";
import { AI_JUNIOR_ALLIANCES_CHANGELOG } from "./client-changelog-ai-junior-alliances.js";

// November 2026 topic files, grouped so client-changelog-data.ts stays under
// the 500-line limit. Add new per-topic imports here, not there.
export const NOVEMBER_CHANGELOG: ClientChangelogEntry[] = [
  ...AETHER_TOWER_SHOTS_CHANGELOG,
  ...LEGAL_PAGES_CHANGELOG,
  ...CAPTURE_AFTERMATH_CHANGELOG,
  ...SHARDS_REMOVED_CHANGELOG,
  ...AFC_V3_CHANGELOG,
  ...AI_STACKED_INDUSTRY_CHANGELOG,
  ...HUD_V2_MOBILE_CHANGELOG,
  ...AI_JUNIOR_ALLIANCES_CHANGELOG
];
