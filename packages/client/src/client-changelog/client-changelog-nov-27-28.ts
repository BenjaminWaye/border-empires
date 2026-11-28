// Entries from 27-28 Nov 2026, split out of client-changelog-data.ts (500-line limit, AGENTS.md).
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { GUIDE_ISLAND_DOCK_ENTRY } from "./client-changelog-guide-island-dock.js";
import { ATTACK_EN_ROUTE_ENTRY } from "./client-changelog-attack-en-route.js";
import { INSURGENTS_ENTRY } from "./client-changelog-insurgents.js";
import { SETTINGS_MENU_TIDY_ENTRY } from "./client-changelog-settings-menu-tidy.js";
import { LANDING_WAIT_ENTRY } from "./client-changelog-landing-wait.js";
import { ANALYTICS_CONSENT_ENTRY } from "./client-changelog-analytics-consent.js";
import { NUMBER_AGREEMENT_ENTRY } from "./client-changelog-number-agreement.js";
import { FIRST15_GUIDE_CAMERA_ENTRY } from "./client-changelog-first15-guide-camera.js";
import { SLOW_GPU_BACKOFF_ENTRY } from "./client-changelog-slow-gpu-backoff.js";
import { POPUPS_WAIT_THEIR_TURN_ENTRY } from "./client-changelog-popups-wait-their-turn.js";

export const NOV_27_28_CHANGELOG: ClientChangelogEntry[] = [
  { ...GUIDE_ISLAND_DOCK_ENTRY, createdAt: 1795779416929, },
  { ...ATTACK_EN_ROUTE_ENTRY, createdAt: 1795779638841, },
  { ...INSURGENTS_ENTRY, createdAt: 1795780690085, },
  { ...SETTINGS_MENU_TIDY_ENTRY, createdAt: 1795792563517, },
  { ...LANDING_WAIT_ENTRY, createdAt: 1795824207646, },
  { ...ANALYTICS_CONSENT_ENTRY, createdAt: 1795825991167, },
  { ...POPUPS_WAIT_THEIR_TURN_ENTRY, createdAt: 1795849065496, },
  { ...NUMBER_AGREEMENT_ENTRY, createdAt: 1795849095118, },
  { ...FIRST15_GUIDE_CAMERA_ENTRY, createdAt: 1795851462394, },
  SLOW_GPU_BACKOFF_ENTRY,
];
