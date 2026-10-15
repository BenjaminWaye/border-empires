// Ability icons (public/icons/abilities, 24px-grid SVGs in the same style as
// public/icons/simple). Each one draws what the ability does, replacing the
// text symbols the ability info card, the tile menu's Crystal tab and the
// Manifest "What you get" rows used to show.
import type { CrystalAbilityInfoKey } from "../client-crystal-ability-info/client-crystal-ability-info.js";
import type { TileActionDef } from "../client-types.js";

const ABILITY_ICON_FILE: Readonly<Record<CrystalAbilityInfoKey, string>> = {
  reveal_empire: "reveal-empire",
  reveal_empire_stats: "reveal-empire-stats",
  survey_sweep: "survey-sweep",
  aether_lance: "aether-purge",
  aether_bridge: "aether-bridge",
  aether_wall: "aether-wall",
  siphon: "siphon",
  aether_emp: "aether-emp",
  city_overclock: "city-overclock",
  stormfront: "stormfront",
  aegis_lock: "aegis-lock",
  astral_dock_launch: "launch-satellite",
  create_mountain: "create-mountain",
  remove_mountain: "remove-mountain",
  retort_recasting: "retort-transmutation"
};

export const ABILITY_ICON_KEYS = Object.keys(ABILITY_ICON_FILE) as CrystalAbilityInfoKey[];

export const abilityIconUrl = (key: CrystalAbilityInfoKey): string => `/icons/abilities/${ABILITY_ICON_FILE[key]}.svg`;

export const abilityIconHtml = (key: CrystalAbilityInfoKey, className: string): string =>
  `<img class="${className}" src="${abilityIconUrl(key)}" alt="" aria-hidden="true" draggable="false" decoding="async">`;

// Tile-menu action ids that cast an ability; ids that already match an
// ability key map to themselves.
const ABILITY_FOR_TILE_ACTION: Partial<Record<TileActionDef["id"], CrystalAbilityInfoKey>> = {
  siphon_tile: "siphon",
  retort_recast_food: "retort_recasting",
  retort_recast_titanium: "retort_recasting",
  retort_recast_crystal: "retort_recasting",
  retort_recast_umbrite: "retort_recasting"
};

const isAbilityIconKey = (id: string): id is CrystalAbilityInfoKey => Object.prototype.hasOwnProperty.call(ABILITY_ICON_FILE, id);

export const abilityKeyForTileAction = (actionId: TileActionDef["id"]): CrystalAbilityInfoKey | undefined =>
  ABILITY_FOR_TILE_ACTION[actionId] ?? (isAbilityIconKey(actionId) ? actionId : undefined);
