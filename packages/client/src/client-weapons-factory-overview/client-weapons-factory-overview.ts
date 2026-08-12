import {
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING
} from "@border-empires/shared";
import type { Tile } from "../client-types.js";

const formatPercent = (mult: number): string => `${mult >= 0 ? "+" : ""}${(mult * 100).toFixed(1).replace(/\.0$/, "")}%`;

// This one building's own per-copy contribution (flat constant, independent
// of network size) — distinct from the town-network total below.
export const weaponsFactoryOwnBonusLine = (tile: Tile): string | undefined => {
  if (tile.economicStructure?.status !== "active") return undefined;
  if (tile.economicStructure.type === "TITANIUM_WEAPONS_FACTORY") {
    return `This Titanium Weapons Factory contributes ${formatPercent(TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING)} attack / ${formatPercent(TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING)} defense to its town's connected network.`;
  }
  if (tile.economicStructure.type === "UMBRITE_WEAPONS_FACTORY") {
    return `This Umbrite Weapons Factory contributes ${formatPercent(UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING)} attack / ${formatPercent(UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING)} defense to its town's connected network.`;
  }
  return undefined;
};

// Sum across every active Titanium/Umbrite Weapons Factory in this town's
// connected network (server-computed count, see
// ConnectedTownNetworkEntry.connectedTitaniumWeaponsFactoryCount /
// connectedUmbriteWeaponsFactoryCount) — the actual total combat reads for
// an attack or defense launched from/at this network.
export const weaponsFactoryNetworkTotalLine = (town: NonNullable<Tile["town"]>): string | undefined => {
  const titanium = town.connectedTitaniumWeaponsFactoryCount ?? 0;
  const umbrite = town.connectedUmbriteWeaponsFactoryCount ?? 0;
  if (titanium === 0 && umbrite === 0) return undefined;
  const parts: string[] = [];
  if (titanium > 0) {
    const attack = titanium * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING;
    const defense = titanium * TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING;
    parts.push(`${titanium} Titanium Weapons Factor${titanium === 1 ? "y" : "ies"} (${formatPercent(attack)} attack / ${formatPercent(defense)} defense)`);
  }
  if (umbrite > 0) {
    const attack = umbrite * UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING;
    const defense = umbrite * UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING;
    parts.push(`${umbrite} Umbrite Weapons Factor${umbrite === 1 ? "y" : "ies"} (${formatPercent(attack)} attack / ${formatPercent(defense)} defense)`);
  }
  return `This town's connected network has ${parts.join(" and ")}.`;
};
