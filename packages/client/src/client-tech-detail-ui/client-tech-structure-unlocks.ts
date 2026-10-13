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
      case "unlockFarmstead":
        out.add("FARMSTEAD");
        break;
      case "unlockWaterworksUpgrade":
        out.add("WATERWORKS");
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
      case "unlockMintworks":
        out.add("MINTWORKS");
        break;
      case "unlockGranary":
        out.add("GRANARY");
        break;
      case "unlockCensusHall":
        out.add("CENSUS_HALL");
        break;
      case "unlockClearingHouse":
        out.add("CLEARING_HOUSE");
        break;
      case "unlockCaravanary":
        out.add("CARAVANARY");
        break;
      case "unlockUmbriteSynthesizer":
        out.add("UMBRITE_SYNTHESIZER");
        break;
      case "unlockTitaniumWorks":
        out.add("TITANIUM_WORKS");
        break;
      case "unlockCrystalSynthesizer":
        out.add("CRYSTAL_SYNTHESIZER");
        break;
      case "unlockAdvancedSynthesizers":
        out.add("ADVANCED_UMBRITE_SYNTHESIZER");
        out.add("ADVANCED_TITANIUM_WORKS");
        out.add("ADVANCED_CRYSTAL_SYNTHESIZER");
        break;
      case "unlockFoundry":
        out.add("FOUNDRY");
        break;
      case "unlockAetherTower":
        out.add("AETHER_TOWER");
        break;
      case "unlockCustomsHouse":
        out.add("CUSTOMS_HOUSE");
        break;
      case "unlockGovernorsOffice":
        out.add("GOVERNORS_OFFICE");
        break;
      case "unlockGarrisonHall":
        out.add("GARRISON_HALL");
        break;
      case "unlockAirport":
        out.add("AIRPORT");
        break;
      case "unlockAstralDock":
        out.add("ASTRAL_DOCK_PART_1");
        out.add("ASTRAL_DOCK_PART_2");
        out.add("ASTRAL_DOCK_PART_3");
        out.add("ASTRAL_DOCK");
        break;
      case "unlockRadarSystem":
        out.add("RADAR_SYSTEM");
        break;
      case "unlockImperialExchange":
        out.add("IMPERIAL_EXCHANGE_PART_1");
        out.add("IMPERIAL_EXCHANGE_PART_2");
        out.add("IMPERIAL_EXCHANGE_PART_3");
        out.add("IMPERIAL_EXCHANGE");
        break;
      case "unlockWorldEngine":
        out.add("WORLD_ENGINE_PART_1");
        out.add("WORLD_ENGINE_PART_2");
        out.add("WORLD_ENGINE_PART_3");
        out.add("WORLD_ENGINE");
        break;
      case "unlockAegisDome":
        out.add("AEGIS_DOME_PART_1");
        out.add("AEGIS_DOME_PART_2");
        out.add("AEGIS_DOME_PART_3");
        out.add("AEGIS_DOME");
        break;
      case "unlockRailDepot":
        out.add("RAIL_DEPOT");
        break;
      case "unlockLogisticsGuild":
        out.add("LOGISTICS_GUILD");
        break;
      case "unlockAssemblyWorks":
        out.add("ASSEMBLY_WORKS");
        break;
      // unlockWeaponsWorkshop retired — replaced by the two cases below.
      case "unlockTitaniumWeaponsFactory":
        out.add("TITANIUM_WEAPONS_FACTORY");
        break;
      case "unlockUmbriteWeaponsFactory":
        out.add("UMBRITE_WEAPONS_FACTORY");
        break;
      case "unlockPopulationBureau":
        out.add("POPULATION_BUREAU_PART_1");
        out.add("POPULATION_BUREAU_PART_2");
        out.add("POPULATION_BUREAU_PART_3");
        out.add("POPULATION_BUREAU");
        break;
      case "unlockTitaniumLevy":
        out.add("TITANIUM_LEVY_PART_1");
        out.add("TITANIUM_LEVY_PART_2");
        out.add("TITANIUM_LEVY_PART_3");
        out.add("TITANIUM_LEVY");
        break;
      case "unlockSiegeOutposts":
        out.add("SIEGE_OUTPOST");
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
