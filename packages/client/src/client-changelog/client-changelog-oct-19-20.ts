import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { BATTLE_TILE_SOUND_CHANGELOG } from "./client-changelog-battle-tile-sound.js";
import { TOWN_VISUALS_CHANGELOG } from "./client-changelog-town-visuals.js";
import { TOWN_BANNERS_CHANGELOG } from "./client-changelog-town-banners.js";
import { WAR_MUSIC_DIPLOMACY_CHANGELOG } from "./client-changelog-war-music-diplomacy.js";
import { CONSTRUCTION_POD_DELIVERY_CHANGELOG } from "./client-changelog-construction-pod-delivery.js";
import { MUSTER_SIEGE_CHANGELOG } from "./client-changelog-muster-siege.js";
import { FOGGED_MIST_CHANGELOG } from "./client-changelog-fogged-mist.js";

// The per-feature changelog files landed on 2026-10-19/20, gathered here
// (extracted from client-changelog-data.ts, which sits at the 500-line cap).
// Same rules as there: entries are unordered and age out of the week window.
export const CLIENT_CHANGELOG_ENTRIES_OCT_19_20: ClientChangelogEntry[] = [
  ...BATTLE_TILE_SOUND_CHANGELOG,
  ...TOWN_VISUALS_CHANGELOG,
  ...TOWN_BANNERS_CHANGELOG,
  ...WAR_MUSIC_DIPLOMACY_CHANGELOG,
  ...CONSTRUCTION_POD_DELIVERY_CHANGELOG,
  ...MUSTER_SIEGE_CHANGELOG,
  ...FOGGED_MIST_CHANGELOG
];
