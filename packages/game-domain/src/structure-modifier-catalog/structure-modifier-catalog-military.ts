// Fort/siege/defense-family modifier entries — split out from the economic
// catalog to keep each file under the repo's 500-line cap.
import {
  DREAD_TOWER_ATTACK_MULT, OBSERVATORY_VISION_BONUS, OBSERVATORY_RANGE, RELAY_BEACON_VISION_BONUS,
  SIEGE_OUTPOST_ATTACK_MULT, SIEGE_TOWER_ATTACK_MULT, WOODEN_FORT_DEFENSE_MULT,
  WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING, WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING, TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING, UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING
} from "@border-empires/shared";
import { multiplierPercentLabel, percentLabel, type ModifierStructureType, type StructureModifier } from "./structure-modifier-catalog-types.js";

export const militaryStructureModifiers = (type: ModifierStructureType): StructureModifier[] | undefined => {
  if (type === "FORT") return [{ statLabel: "Defense", valueText: "2.5x", tone: "positive", isTownWide: false }];
  if (type === "TITANIUM_BASTION") return [{ statLabel: "Defense", valueText: "4x", tone: "positive", isTownWide: false }];
  if (type === "THUNDER_BASTION") return [{ statLabel: "Defense", valueText: "8x", tone: "positive", isTownWide: false }];
  if (type === "WOODEN_FORT") return [{ statLabel: "Defense", valueText: multiplierPercentLabel(WOODEN_FORT_DEFENSE_MULT), tone: "positive", isTownWide: false }];
  if (type === "RELAY_BEACON") {
    return [
      { statLabel: "Local vision", valueText: `+${RELAY_BEACON_VISION_BONUS}`, tone: "positive", isTownWide: false }
    ];
  }
  if (type === "SIEGE_OUTPOST") return [{ statLabel: "Offense", valueText: multiplierPercentLabel(SIEGE_OUTPOST_ATTACK_MULT), tone: "positive", isTownWide: false }];
  if (type === "SIEGE_TOWER") return [{ statLabel: "Offense", valueText: multiplierPercentLabel(SIEGE_TOWER_ATTACK_MULT), tone: "positive", isTownWide: false }];
  if (type === "DREAD_TOWER") return [{ statLabel: "Offense", valueText: multiplierPercentLabel(DREAD_TOWER_ATTACK_MULT), tone: "positive", isTownWide: false }];
  if (type === "OBSERVATORY") {
    return [
      { statLabel: "Local vision", valueText: `+${OBSERVATORY_VISION_BONUS}`, tone: "positive", isTownWide: false },
      { statLabel: "Crystal range", valueText: `${OBSERVATORY_RANGE} tiles`, tone: "positive", isTownWide: false }
    ];
  }
  if (type === "WEAPONS_WORKSHOP") {
    return [
      {
        statLabel: "Empire attack", valueText: `${percentLabel(WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING * 100)} per copy`,
        tone: "positive", isTownWide: true, rawValue: WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING * 100, unit: "percent"
      },
      {
        statLabel: "Empire defense", valueText: `${percentLabel(WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING * 100)} per copy`,
        tone: "positive", isTownWide: true, rawValue: WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING * 100, unit: "percent"
      }
    ];
  }
  if (type === "TITANIUM_WEAPONS_FACTORY") {
    return [
      {
        statLabel: "Empire attack", valueText: `${percentLabel(TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING * 100)} per copy`,
        tone: "positive", isTownWide: true, rawValue: TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING * 100, unit: "percent"
      },
      {
        statLabel: "Empire defense", valueText: `${percentLabel(TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING * 100)} per copy`,
        tone: "positive", isTownWide: true, rawValue: TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING * 100, unit: "percent"
      }
    ];
  }
  if (type === "UMBRITE_WEAPONS_FACTORY") {
    return [
      {
        statLabel: "Empire attack", valueText: `${percentLabel(UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING * 100)} per copy`,
        tone: "positive", isTownWide: true, rawValue: UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING * 100, unit: "percent"
      },
      {
        statLabel: "Empire defense", valueText: `${percentLabel(UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING * 100)} per copy`,
        tone: "positive", isTownWide: true, rawValue: UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING * 100, unit: "percent"
      }
    ];
  }
  return undefined;
};
