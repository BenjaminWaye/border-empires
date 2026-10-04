import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_ATTACK } from "./client-changelog-arrow-gesture-attack.js";
import { CLIENT_CHANGELOG_ENTRIES_ENEMY_CONSTRUCTION_ACTIONS } from "./client-changelog-enemy-construction-actions.js";
import { CLIENT_CHANGELOG_ENTRIES_FARMLAND } from "./client-changelog-farmland.js";
import { CLIENT_CHANGELOG_ENTRIES_JOIN_SEASON_LOADING } from "./client-changelog-join-season-loading.js";
import { CLIENT_CHANGELOG_ENTRIES_MUSTER_STAND } from "./client-changelog-muster-stand.js";
import { CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER } from "./client-changelog-parallel-muster.js";
import { CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP } from "./client-changelog-self-profile-chip.js";
import { CLIENT_CHANGELOG_ENTRIES_WAYSTATION_REWARDS } from "./client-changelog-waystation-rewards.js";
import { CLIENT_CHANGELOG_ENTRIES_WIN_CHANCE_PAINT } from "./client-changelog-win-chance-paint.js";
import { CLIENT_CHANGELOG_ENTRIES_2D_ARROW_GESTURE_PARITY } from "./client-changelog-2d-arrow-gesture-parity.js";
import { CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_LINGERING_FIX } from "./client-changelog-arrow-gesture-lingering-fix.js";
import { CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_MAC_SHIELD_WASH } from "./client-changelog-arrow-gesture-mac-shield-wash.js";
import { CLIENT_CHANGELOG_ENTRIES_RENDERER_SWITCH } from "./client-changelog-renderer-switch.js";
import { CLIENT_CHANGELOG_ENTRIES_AI_FORT_AND_GOLD_CAP } from "./client-changelog-ai-fort-and-gold-cap.js";
import { CLIENT_CHANGELOG_ENTRIES_SECTOR_NUMBERING } from "./client-changelog-sector-numbering.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_JOIN_DROP } from "./client-changelog-afc-join-drop.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_MODULE_SLOTS } from "./client-changelog-afc-module-slots.js";
import { CLIENT_CHANGELOG_ENTRIES_SMALLER_TREES } from "./client-changelog-smaller-trees.js";
import { CLIENT_CHANGELOG_ENTRIES_ARROW_CLICK_TARGETING } from "./client-changelog-arrow-click-targeting.js";
import { CLIENT_CHANGELOG_ENTRIES_RELAY_BEACON_INSTANT } from "./client-changelog-relay-beacon-instant.js";
import { CLIENT_CHANGELOG_ENTRIES_AFC_CONSTRUCTION } from "./client-changelog-afc-construction.js";
import { CLIENT_CHANGELOG_ENTRIES_PLANETARY_DEFENSE } from "./client-changelog-planetary-defense.js";
import { CLIENT_CHANGELOG_ENTRIES_SETTLE_PROMPT_AFTER_WHATS_NEW } from "./client-changelog-settle-prompt-after-whats-new.js";
import { CLIENT_CHANGELOG_ENTRIES_COMPACT_AUTO_SETTLE_PROMPT } from "./client-changelog-compact-auto-settle-prompt.js";
import { CLIENT_CHANGELOG_ENTRIES_SOFTER_METAL_REFLECTIONS } from "./client-changelog-softer-metal-reflections.js";

// Small per-feature entry files, gathered so client-changelog-data.ts stays under the 500-line cap.
export const CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS: ClientChangelogEntry[] = [
  ...CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER,
  ...CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP,
  ...CLIENT_CHANGELOG_ENTRIES_FARMLAND,
  ...CLIENT_CHANGELOG_ENTRIES_MUSTER_STAND,
  ...CLIENT_CHANGELOG_ENTRIES_WAYSTATION_REWARDS,
  ...CLIENT_CHANGELOG_ENTRIES_WIN_CHANCE_PAINT,
  ...CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_ATTACK,
  ...CLIENT_CHANGELOG_ENTRIES_2D_ARROW_GESTURE_PARITY,
  ...CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_LINGERING_FIX,
  ...CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_MAC_SHIELD_WASH,
  ...CLIENT_CHANGELOG_ENTRIES_JOIN_SEASON_LOADING,
  ...CLIENT_CHANGELOG_ENTRIES_RENDERER_SWITCH,
  ...CLIENT_CHANGELOG_ENTRIES_AFC_JOIN_DROP,
  ...CLIENT_CHANGELOG_ENTRIES_ENEMY_CONSTRUCTION_ACTIONS,
  ...CLIENT_CHANGELOG_ENTRIES_AFC_MODULE_SLOTS,
  ...CLIENT_CHANGELOG_ENTRIES_AI_FORT_AND_GOLD_CAP,
  ...CLIENT_CHANGELOG_ENTRIES_SECTOR_NUMBERING,
  ...CLIENT_CHANGELOG_ENTRIES_SMALLER_TREES,
  ...CLIENT_CHANGELOG_ENTRIES_ARROW_CLICK_TARGETING,
    ...CLIENT_CHANGELOG_ENTRIES_RELAY_BEACON_INSTANT,
    ...CLIENT_CHANGELOG_ENTRIES_PLANETARY_DEFENSE,
    ...CLIENT_CHANGELOG_ENTRIES_COMPACT_AUTO_SETTLE_PROMPT,
    ...CLIENT_CHANGELOG_ENTRIES_SETTLE_PROMPT_AFTER_WHATS_NEW,
  ...CLIENT_CHANGELOG_ENTRIES_AFC_CONSTRUCTION,
  ...CLIENT_CHANGELOG_ENTRIES_SOFTER_METAL_REFLECTIONS
];
