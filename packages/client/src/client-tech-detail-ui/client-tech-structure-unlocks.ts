// Maps a Manifest's unlock effect keys to the structures it lets you build.
// Split out of client-tech-detail-ui.ts so the Manifest detail view
// (client-manifest-detail) can use it without importing the panel module
// that renders that view.
import type { StructureInfoKey } from "../client-map-display.js";
import type { TechInfo } from "../client-types.js";

export const relatedStructureTypesForTech = (tech: Pick<TechInfo, "effects">): StructureInfoKey[] => {
  const out = new Set<StructureInfoKey>();
  const effects = tech.effects ?? {};
  for (const [key] of Object.entries(effects)) {
    switch (key) {
      case "unlockForts":
        out.add("FORT");
        break;
      case "unlockTitaniumBastion":
        out.add("TITANIUM_BASTION");
        break;
      case "unlockThunderBastion":
        out.add("THUNDER_BASTION");
        break;
      case "unlockObservatory":
        out.add("OBSERVATORY");
        break;
      case "unlockHydrogarden":
        out.add("HYDROGARDEN");
        break;
      case "unlockHydroworksUpgrade":
        out.add("HYDROWORKS");
        break;
      // The catalog's key is unlockUmbriteRig; this used to match only the
      // retired unlockCamp, so Rigging Works never listed the Umbrite Rig.
      case "unlockUmbriteRig":
      case "unlockCamp":
        out.add("UMBRITE_RIG");
        break;
      case "unlockMine":
        out.add("MINE");
        break;
      case "unlockManufactory":
        out.add("MANUFACTORY");
        break;
      case "unlockIncubationEngine":
        out.add("INCUBATION_ENGINE");
        break;
      case "unlockCensusHall":
        out.add("CENSUS_HALL");
        break;
      case "unlockClearingHouse":
        out.add("CLEARING_HOUSE");
        break;
      case "unlockTradeNexus":
        out.add("TRADE_NEXUS");
        break;
      case "unlockUmbriteWorks":
        out.add("UMBRITE_WORKS");
        break;
      case "unlockTitaniumWorks":
        out.add("TITANIUM_WORKS");
        break;
      case "unlockAetherCondenser":
        out.add("AETHER_CONDENSER");
        break;
      case "unlockAdvancedSynthesizers":
        out.add("HIGH_YIELD_UMBRITE_WORKS");
        out.add("HIGH_YIELD_TITANIUM_WORKS");
        out.add("HIGH_YIELD_AETHER_CONDENSER");
        break;
      case "unlockOreRefinery":
        out.add("ORE_REFINERY");
        break;
      case "unlockAmbaricTransformer":
        out.add("AMBARIC_TRANSFORMER");
        break;
      case "unlockHarborExchange":
        out.add("HARBOR_EXCHANGE");
        break;
      case "unlockMinistryHall":
        out.add("MINISTRY_HALL");
        break;
      case "unlockAncillaryDepot":
        out.add("ANCILLARY_DEPOT");
        break;
      case "unlockSkyDock":
        out.add("SKY_DOCK");
        break;
      case "unlockAstralDock":
        out.add("ASTRAL_DOCK_PART_1");
        out.add("ASTRAL_DOCK_PART_2");
        out.add("ASTRAL_DOCK_PART_3");
        out.add("ASTRAL_DOCK");
        break;
      case "unlockResonanceGrid":
        out.add("RESONANCE_GRID");
        break;
      case "unlockImperialExchange":
        out.add("IMPERIAL_EXCHANGE_PART_1");
        out.add("IMPERIAL_EXCHANGE_PART_2");
        out.add("IMPERIAL_EXCHANGE_PART_3");
        out.add("IMPERIAL_EXCHANGE");
        break;
      case "unlockSovereignSiegeEngine":
        out.add("SOVEREIGN_SIEGE_ENGINE_PART_1");
        out.add("SOVEREIGN_SIEGE_ENGINE_PART_2");
        out.add("SOVEREIGN_SIEGE_ENGINE_PART_3");
        out.add("SOVEREIGN_SIEGE_ENGINE");
        break;
      case "unlockAegisDome":
        out.add("AEGIS_DOME_PART_1");
        out.add("AEGIS_DOME_PART_2");
        out.add("AEGIS_DOME_PART_3");
        out.add("AEGIS_DOME");
        break;
      case "unlockNeuralWorks":
        out.add("NEURAL_WORKS");
        break;
      case "unlockAncillaryFactory":
        out.add("ANCILLARY_FACTORY");
        break;
      case "unlockReserveLattice":
        out.add("RESERVE_LATTICE");
        break;
      // unlockWeaponsWorkshop retired — replaced by the two cases below.
      case "unlockTitaniumWeaponsFactory":
        out.add("TITANIUM_WEAPONS_FACTORY");
        break;
      case "unlockUmbriteWeaponsFactory":
        out.add("UMBRITE_WEAPONS_FACTORY");
        break;
      case "unlockCensusDirectorate":
        out.add("CENSUS_DIRECTORATE_PART_1");
        out.add("CENSUS_DIRECTORATE_PART_2");
        out.add("CENSUS_DIRECTORATE_PART_3");
        out.add("CENSUS_DIRECTORATE");
        break;
      case "unlockTitaniumLevy":
        out.add("TITANIUM_LEVY_PART_1");
        out.add("TITANIUM_LEVY_PART_2");
        out.add("TITANIUM_LEVY_PART_3");
        out.add("TITANIUM_LEVY");
        break;
      case "unlockSiegeBatteries":
        out.add("SIEGE_BATTERY");
        break;
      case "unlockSiegeTower":
        out.add("SIEGE_TOWER");
        break;
      case "unlockDreadTower":
        out.add("DREAD_TOWER");
        break;
      default:
        break;
    }
  }
  return [...out];
};
