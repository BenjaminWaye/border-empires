// 2026.11.19-20 client releases, grouped so client-changelog-data.ts stays under the file-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { SCOUT_REACH_SPEEDUP_ENTRY } from "./client-changelog-scout-reach-speedup.js";
import { TAP_CONFIRM_BRASS_ENTRY } from "./client-changelog-tap-confirm-brass.js";
import { FOOD_SHORTAGE_GUIDANCE_ENTRY } from "./client-changelog-food-shortage.js";
import { EXPAND_CREW_ENTRY } from "./client-changelog-expand-crew.js";
import { FAIR_DIPLOMACY_ENTRY } from "./client-changelog-fair-diplomacy.js";
import { ENVOY_PER_TRUCE_ENTRY } from "./client-changelog-envoy-per-truce.js";
import { RETURN_A_TOWN_ENTRY } from "./client-changelog-return-a-town.js";
import { LOGIN_LORE_WORLD_ENGINE_ENTRY } from "./client-changelog-login-lore-world-engine.js";
import { AFC_UPGRADES_BEFORE_MANIFEST_ENTRY } from "./client-changelog-afc-upgrades-before-manifest.js";
import { PLACE_ANOTHER_PLOTS_ENTRY } from "./client-changelog-place-another-plots.js";
import { UNGARRISONED_TOWN_ENTRY } from "./client-changelog-ungarrisoned-town.js";
import { START_SITE_PATROLS_ENTRY } from "./client-changelog-start-site-patrols.js";
import { SCOUT_DRONE_ANY_DISTANCE_ENTRY } from "./client-changelog-scout-drone-any-distance.js";
import { START_SITE_PATROLS_ISLANDS_ENTRY } from "./client-changelog-start-site-patrols-islands.js";
import { PLANETARY_DEFENSE_CAMPS_ENTRY } from "./client-changelog-planetary-defense-camps.js";

export const NOV_19_20_CHANGELOG: ClientChangelogEntry[] = [
  { ...TAP_CONFIRM_BRASS_ENTRY, createdAt: 1795104400095, },
  { ...SCOUT_REACH_SPEEDUP_ENTRY, createdAt: 1795104752202, },
  { ...FOOD_SHORTAGE_GUIDANCE_ENTRY, createdAt: 1795105716456, },
  { ...EXPAND_CREW_ENTRY, createdAt: 1795105822191, },
  { ...FAIR_DIPLOMACY_ENTRY, createdAt: 1795121188927, },
  { ...PLACE_ANOTHER_PLOTS_ENTRY, createdAt: 1795153409713 },
  { ...UNGARRISONED_TOWN_ENTRY, createdAt: 1795120690978, },
  { ...ENVOY_PER_TRUCE_ENTRY, createdAt: 1795123031402, },
  { ...RETURN_A_TOWN_ENTRY, createdAt: 1795153599126, },
  { ...LOGIN_LORE_WORLD_ENGINE_ENTRY, createdAt: 1795160318022, },
  { ...AFC_UPGRADES_BEFORE_MANIFEST_ENTRY, createdAt: 1795160490729 },
  { ...START_SITE_PATROLS_ENTRY, createdAt: 1795170704736, },
  { ...SCOUT_DRONE_ANY_DISTANCE_ENTRY, createdAt: 1795173371678 },
  { ...START_SITE_PATROLS_ISLANDS_ENTRY, createdAt: 1795175657050, },
  { ...PLANETARY_DEFENSE_CAMPS_ENTRY, createdAt: 1795178995450 },
];
