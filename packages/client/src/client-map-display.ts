import {
  OBSERVATORY_UPKEEP_PER_MIN,
  economicStructureBuildDurationMs,
  structureBuildDurationMs,
  structureCostDefinition
} from "@border-empires/shared";
import { OBSERVATORY_VISION_BONUS } from "./client-constants.js";
import { OBSERVATORY_RANGE } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

export type StructureInfoKey =
  | "FORT"
  | "IRON_BASTION"
  | "THUNDER_BASTION"
  | "OBSERVATORY"
  | "FARMSTEAD"
  | "WATERWORKS"
  | "CAMP"
  | "MINE"
  | "MARKET"
  | "BROKER_MARKET"
  | "GRANARY"
  | "SEED_GRANARY"
  | "CENSUS_HALL"
  | "BANK"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "TREASURY_HOUSE"
  | "WOODEN_FORT"
  | "LIGHT_OUTPOST"
  | "FUR_SYNTHESIZER"
  | "ADVANCED_FUR_SYNTHESIZER"
  | "IRONWORKS"
  | "ADVANCED_IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "FOUNDRY"
  | "ADVANCED_FOUNDRY"
  | "EXCHANGE_HOUSE"
  | "CUSTOMS_HOUSE"
  | "GOVERNORS_OFFICE"
  | "GARRISON_HALL"
  | "AIRPORT"
  | "AETHER_TOWER"
  | "RADAR_SYSTEM"
  | "ASTRAL_DOCK_PART"
  | "ASTRAL_DOCK"
  | "RAIL_DEPOT"
  | "WEATHER_ENGINE"
  | "IMPERIAL_EXCHANGE_PART"
  | "WORLD_ENGINE_PART"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE"
  | "AEGIS_DOME_PART"
  | "AEGIS_DOME"
  | "SIEGE_OUTPOST"
  | "SIEGE_TOWER"
  | "DREAD_TOWER";

export type StructureInfoView = {
  title: string;
  detail: string;
  effects: string[];
  glyph: string;
  placement: string;
  image?: string;
  costBits: string[];
  buildTimeLabel: string;
  upkeepBits?: string[];
};

export const economicStructureName = (type: EconomicStructureType | StructureInfoKey): string => {
  const kind = type as string;
  if (kind === "FARMSTEAD") return "Farmstead";
  if (kind === "WATERWORKS") return "Waterworks";
  if (kind === "CAMP") return "Camp";
  if (kind === "MINE") return "Mine";
  if (kind === "BROKER_MARKET") return "Broker Market";
  if (kind === "GRANARY") return "Granary";
  if (kind === "SEED_GRANARY") return "Seed Granary";
  if (kind === "CENSUS_HALL") return "Census Hall";
  if (kind === "BANK") return "Bank";
  if (kind === "CLEARING_HOUSE") return "Clearing House";
  if (kind === "AIRPORT") return "Sky Dock";
  if (kind === "AETHER_TOWER") return "Aether Tower";
  if (kind === "WOODEN_FORT") return "Wooden Fort";
  if (kind === "LIGHT_OUTPOST") return "Light Outpost";
  if (kind === "CARAVANARY") return "Caravanary";
  if (kind === "FUR_SYNTHESIZER") return "Fur Synthesizer";
  if (kind === "ADVANCED_FUR_SYNTHESIZER") return "Advanced Fur Synthesizer";
  if (kind === "IRONWORKS") return "Ironworks";
  if (kind === "ADVANCED_IRONWORKS") return "Advanced Ironworks";
  if (kind === "CRYSTAL_SYNTHESIZER") return "Aether Condenser";
  if (kind === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Advanced Aether Condenser";
  if (kind === "FOUNDRY") return "Foundry";
  if (kind === "ADVANCED_FOUNDRY") return "Advanced Foundry";
  if (kind === "EXCHANGE_HOUSE") return "Exchange House";
  if (kind === "GARRISON_HALL") return "Garrison Hall";
  if (kind === "CUSTOMS_HOUSE") return "Harbor Exchange";
  if (kind === "GOVERNORS_OFFICE") return "Ministry Hall";
  if (kind === "RADAR_SYSTEM") return "Resonance Grid";
  if (kind === "ASTRAL_DOCK_PART") return "Astral Dock Part";
  if (kind === "ASTRAL_DOCK") return "Astral Dock";
  if (kind === "RAIL_DEPOT") return "Rail Depot";
  if (kind === "WEATHER_ENGINE") return "Weather Engine";
  if (kind === "IMPERIAL_EXCHANGE_PART") return "Imperial Exchange Part";
  if (kind === "WORLD_ENGINE_PART") return "Worldbreaker Cannon Part";
  if (kind === "IMPERIAL_EXCHANGE") return "Imperial Exchange";
  if (kind === "AEGIS_DOME_PART") return "Aegis Dome Part";
  if (kind === "AEGIS_DOME") return "Aegis Dome";
  if (kind === "WORLD_ENGINE") return "Worldbreaker Cannon";
  return "Market";
};

export const economicStructureBenefitText = (type: EconomicStructureType | StructureInfoKey): string => {
  const kind = type as string;
  if (kind === "MARKET") return "Nearby town: +50% gold production; higher production raises gold cap.";
  if (kind === "BROKER_MARKET") return "Upgrades a market into a broker market with +87.5% town gold production and +0.5 flat town income.";
  if (kind === "GRANARY") return "Boosts nearby town population growth by 15%.";
  if (kind === "SEED_GRANARY") return "Upgrades a granary into a seed granary with +30% local town population growth and lower local town food upkeep.";
  if (kind === "CENSUS_HALL") return "Drives local population growth through census administration.";
  if (kind === "BANK") return "Nearby town: +50% city income and +1 flat income.";
  if (kind === "CLEARING_HOUSE") return "Strengthens banks and markets for this town and its directly connected towns.";
  if (kind === "AIRPORT") return "Launches crystal-powered bombardment against enemy territory.";
  if (kind === "AETHER_TOWER") return "Powers nearby late-game sky and monument structures.";
  if (kind === "WOODEN_FORT") return "Provides a lighter fortified defense on this owned border tile.";
  if (kind === "LIGHT_OUTPOST") return "Provides a lighter attack bonus from this owned border tile.";
  if (kind === "CARAVANARY") return "Boosts the nearby town's connected-town income bonus by 25%.";
  if (kind === "FUR_SYNTHESIZER") return "Converts gold into 18 supply per day.";
  if (kind === "ADVANCED_FUR_SYNTHESIZER") return "Converts gold into 21.6 supply per day.";
  if (kind === "IRONWORKS") return "Converts gold into 18 iron per day.";
  if (kind === "ADVANCED_IRONWORKS") return "Converts gold into 21.6 iron per day.";
  if (kind === "CRYSTAL_SYNTHESIZER") return "Condenses gold into 12 crystal per day.";
  if (kind === "ADVANCED_CRYSTAL_SYNTHESIZER") return "Condenses gold into 14.4 crystal per day.";
  if (kind === "FOUNDRY") return "Doubles active mine production in a 5-tile radius; boosted production raises iron and crystal caps.";
  if (kind === "ADVANCED_FOUNDRY") return "Upgrades a foundry into a radius-12 mine hub with +150% mine production.";
  if (kind === "EXCHANGE_HOUSE") return "Turns a great city's support network into +10% gold and +5% growth per adjacent active support structure, capped at +80% gold and +40% growth.";
  if (kind === "GARRISON_HALL") return "Boosts settled-tile defense by 20% in a 10-tile radius.";
  if (kind === "CUSTOMS_HOUSE") return "Adds +1 gold / m for each connected owned dock.";
  if (kind === "GOVERNORS_OFFICE") return "Reduces local town food upkeep and cuts settled-tile upkeep by 20% in a 10-tile radius.";
  if (kind === "RADAR_SYSTEM") return "Blocks enemy sky bombardment in a 30-tile radius.";
  if (kind === "ASTRAL_DOCK_PART") return "One of three monument parts needed to assemble the Astral Dock.";
  if (kind === "ASTRAL_DOCK") return "Unique world monument. Launches one satellite for full-map vision for 24 hours.";
  if (kind === "RAIL_DEPOT") return "Every 10 minutes, settles the nearest owned frontier tile within 20 tiles and adds +10 connected-town income points across this town's linked network.";
  if (kind === "WEATHER_ENGINE") return "Blocks hostile bombardment and hostile observatory actions within 30 tiles.";
  if (kind === "IMPERIAL_EXCHANGE_PART") return "One of three monument parts needed to assemble the Imperial Exchange.";
  if (kind === "WORLD_ENGINE_PART") return "One of three monument parts needed to assemble the Worldbreaker Cannon.";
  if (kind === "IMPERIAL_EXCHANGE") return "Unique world monument. Every 60 minutes, it can levy one resource from every rival empire for 240 crystal.";
  if (kind === "AEGIS_DOME_PART") return "One of three monument parts needed to assemble the Aegis Dome.";
  if (kind === "AEGIS_DOME") return "Unique world monument. Projects a 25-tile shield and can trigger a 15-minute Aegis Lock for 220 crystal every 60 minutes.";
  if (kind === "WORLD_ENGINE") return "Unique world monument. Every 90 minutes, it can fire one Worldbreaker shot that shatters an enemy land tile into mountain for 300 crystal.";
  if (kind === "FARMSTEAD") return "Improves food production on farm tiles by 50% and adds +18 food cap.";
  if (kind === "WATERWORKS") return "Boosts all farmstead food production by +50% within a 10-tile radius; boosted production raises food cap.";
  if (kind === "CAMP") return "Improves supply production on this tile by 50% and adds +15 supply cap.";
  if (kind === "MINE") return "Improves iron or crystal production on this tile and raises that resource's cap.";
  return "Strengthens this tile's economy.";
};

export const economicStructureBuildMs = (type: EconomicStructureType): number => {
  return economicStructureBuildDurationMs(type);
};

export const structureInfoForKey = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string }
): StructureInfoView => {
  const structureBaseKey = (
    key: StructureInfoKey
  ):
    | "FORT"
    | "OBSERVATORY"
    | "SIEGE_OUTPOST"
    | "FARMSTEAD"
    | "CAMP"
    | "MINE"
    | "MARKET"
    | "GRANARY"
    | "CENSUS_HALL"
    | "BANK"
    | "CLEARING_HOUSE"
    | "CARAVANARY"
    | "AIRPORT"
    | "AETHER_TOWER"
    | "WOODEN_FORT"
    | "LIGHT_OUTPOST"
    | "FUR_SYNTHESIZER"
    | "ADVANCED_FUR_SYNTHESIZER"
    | "IRONWORKS"
    | "ADVANCED_IRONWORKS"
    | "CRYSTAL_SYNTHESIZER"
    | "ADVANCED_CRYSTAL_SYNTHESIZER"
    | "FOUNDRY"
    | "EXCHANGE_HOUSE"
    | "GARRISON_HALL"
    | "CUSTOMS_HOUSE"
    | "RAIL_DEPOT"
    | "GOVERNORS_OFFICE"
    | "RADAR_SYSTEM"
    | "ASTRAL_DOCK_PART"
    | "ASTRAL_DOCK"
    | "IMPERIAL_EXCHANGE_PART"
    | "WORLD_ENGINE_PART"
    | "AEGIS_DOME_PART"
    | "AEGIS_DOME"
    | "IMPERIAL_EXCHANGE"
    | "WORLD_ENGINE" => {
    if (key === "IRON_BASTION") return "FORT";
    if (key === "THUNDER_BASTION") return "FORT";
    if (key === "SIEGE_TOWER") return "SIEGE_OUTPOST";
    if (key === "DREAD_TOWER") return "SIEGE_OUTPOST";
    if (key === "WATERWORKS") return "FARMSTEAD";
    if (key === "BROKER_MARKET") return "MARKET";
    if (key === "SEED_GRANARY") return "GRANARY";
    if (key === "TREASURY_HOUSE") return "BANK";
    if (key === "ADVANCED_FOUNDRY") return "FOUNDRY";
    if (key === "RAIL_DEPOT") return "RAIL_DEPOT";
    if (key === "WEATHER_ENGINE") return "RADAR_SYSTEM";
    return key;
  };
  const buildTimeLabelFor = (key: StructureInfoKey): string =>
    deps.formatCooldownShort(structureBuildDurationMs(structureBaseKey(key)));
  const upkeepBitsFor = (key: StructureInfoKey): string[] => {
    if (key === "IRON_BASTION") return ["0.03 gold / m", "0.03 iron / m"];
    if (key === "THUNDER_BASTION") return ["0.05 gold / m", "0.05 iron / m"];
    if (key === "OBSERVATORY") return [`${OBSERVATORY_UPKEEP_PER_MIN.toFixed(2)} crystal / m`];
    if (key === "WOODEN_FORT") return ["0.50 gold / m"];
    if (key === "LIGHT_OUTPOST") return ["0.50 gold / m"];
    if (key === "FORT") return ["0.03 gold / m", "0.03 iron / m"];
    if (key === "SIEGE_OUTPOST" || key === "SIEGE_TOWER") return ["0.10 gold / m", "0.03 supply / m"];
    if (key === "DREAD_TOWER") return ["0.14 gold / m", "0.05 supply / m"];
    if (key === "MARKET" || key === "BROKER_MARKET" || key === "BANK") return [key === "BANK" ? "0.10 food / m" : "0.05 food / m"];
    if (key === "GRANARY" || key === "SEED_GRANARY" || key === "FARMSTEAD") return ["0.10 gold / m"];
    if (key === "CENSUS_HALL") return ["0.60 gold / m"];
    if (key === "CLEARING_HOUSE") return ["3.00 gold / m"];
    if (key === "WATERWORKS" || key === "CAMP" || key === "MINE") return ["0.12 gold / m"];
    if (key === "CARAVANARY") return ["1.50 gold / m"];
    if (key === "TREASURY_HOUSE") return ["2.00 gold / m"];
    if (key === "FUR_SYNTHESIZER" || key === "ADVANCED_FUR_SYNTHESIZER") return ["12 gold / m"];
    if (key === "IRONWORKS" || key === "ADVANCED_IRONWORKS") return ["12 gold / m"];
    if (key === "CRYSTAL_SYNTHESIZER" || key === "ADVANCED_CRYSTAL_SYNTHESIZER") return ["16 gold / m"];
    if (key === "FOUNDRY") return ["5 gold / m"];
    if (key === "ADVANCED_FOUNDRY") return ["7 gold / m"];
    if (key === "EXCHANGE_HOUSE") return ["6 gold / m", "0.10 crystal / m"];
    if (key === "CUSTOMS_HOUSE") return ["0.50 gold / m"];
    if (key === "GARRISON_HALL") return ["2.50 gold / m"];
    if (key === "GOVERNORS_OFFICE") return ["3 gold / m"];
    if (key === "AIRPORT") return ["0.03 crystal / m"];
    if (key === "AETHER_TOWER") return ["2 gold / m", "0.05 crystal / m"];
    if (key === "RADAR_SYSTEM") return ["4.50 gold / m", "0.05 crystal / m"];
    if (key === "ASTRAL_DOCK_PART") return ["2.50 gold / m"];
    if (key === "ASTRAL_DOCK") return ["9 gold / m", "0.10 crystal / m"];
    if (key === "AEGIS_DOME_PART") return ["2.50 gold / m"];
    if (key === "AEGIS_DOME") return ["8 gold / m", "0.10 crystal / m"];
    if (key === "RAIL_DEPOT") return ["1.50 gold / m"];
    if (key === "WEATHER_ENGINE") return ["4 gold / m", "0.10 crystal / m"];
    return [];
  };
  const effectsFor = (key: StructureInfoKey): string[] => {
    if (key === "FORT") return ["2.5x local defense", "Prevents failed attacks from immediately flipping the fortified origin tile"];
    if (key === "IRON_BASTION") return ["Upgrades Forts into Iron Bastions", "Raises Fort defense from 2.5x to 4x and keeps the +10% settled defense from Bastion Walls"];
    if (key === "THUNDER_BASTION") return ["Upgrades Iron Bastions into Thunder Bastions", "Raises Fort defense from 4x to 8x and improves resistance to siege and lance pressure"];
    if (key === "OBSERVATORY") return [`+${OBSERVATORY_VISION_BONUS} local vision`, `${OBSERVATORY_RANGE}-tile crystal range (protection + casting, grows with tech)`];
    if (key === "WOODEN_FORT") return ["Light defensive fortification", "No iron upkeep"];
    if (key === "LIGHT_OUTPOST") return ["Cheap offensive staging point", "Faster, weaker alternative to a Siege Outpost"];
    if (key === "SIEGE_OUTPOST") return ["+25% local offense", "Improves attacks launched from this tile"];
    if (key === "SIEGE_TOWER") return ["Upgrades Siege Outposts into Siege Towers", "Raises Siege Outpost attack from 1.25x to 2x"];
    if (key === "DREAD_TOWER") return ["Upgrades Siege Towers into Dread Towers", "Raises Siege attack from 2x to 3x against heavy fortified targets"];
    if (key === "FARMSTEAD") return ["+50% food production on FARM tiles only", "+18 food cap"];
    if (key === "WATERWORKS") return ["+50% farmstead food within 10 tiles", "Boosted food production raises food cap"];
    if (key === "CAMP") return ["+50% supply production on WOOD and FUR tiles", "+15 supply cap"];
    if (key === "MINE") return ["+50% iron or crystal production on mineral tiles", "+15 iron cap or +9 crystal cap"];
    if (key === "MARKET") return ["+50% town gold production", "Higher production raises gold cap"];
    if (key === "BROKER_MARKET") return ["+87.5% town gold production", "+0.5 flat town gold income"];
    if (key === "GRANARY") return ["+15% nearby town population growth"];
    if (key === "SEED_GRANARY") return ["+30% local town population growth", "-10% local town food upkeep"];
    if (key === "CENSUS_HALL") return ["+25% local town population growth"];
    if (key === "BANK") return ["+50% city income", "+1 flat city income"];
    if (key === "CLEARING_HOUSE") return ["+25% Market effect across connected towns", "+20% Bank effect across connected towns", "+0.5 flat Bank income across connected towns"];
    if (key === "CARAVANARY") return ["+25 percentage points to connected-town income bonus"];
    if (key === "TREASURY_HOUSE") return ["+25 percentage points to connected-city income bonus", "Higher production raises gold cap"];
    if (key === "FUR_SYNTHESIZER") return ["Produces 18 supply per day"];
    if (key === "ADVANCED_FUR_SYNTHESIZER") return ["Produces 21.6 supply per day"];
    if (key === "IRONWORKS") return ["Produces 18 iron per day"];
    if (key === "ADVANCED_IRONWORKS") return ["Produces 21.6 iron per day"];
    if (key === "CRYSTAL_SYNTHESIZER") return ["Produces 12 crystal per day"];
    if (key === "ADVANCED_CRYSTAL_SYNTHESIZER") return ["Produces 14.4 crystal per day"];
    if (key === "FOUNDRY") return ["Doubles active Mine production within 5 tiles", "Boosted Mine production raises iron and crystal caps"];
    if (key === "ADVANCED_FOUNDRY") return ["+150% active Mine production within 12 tiles", "+7 tile industrial radius compared with a Foundry"];
    if (key === "EXCHANGE_HOUSE") return ["+10% gold and +5% growth per adjacent active support structure", "Caps at +80% gold and +40% growth and requires a Great City or Monumental City support tile"];
    if (key === "CUSTOMS_HOUSE") return ["+1 gold / m per connected owned dock"];
    if (key === "GOVERNORS_OFFICE") return ["-10% local town food upkeep", "-20% settled-tile upkeep within 10 tiles"];
    if (key === "GARRISON_HALL") return ["+20% settled defense within 10 tiles"];
    if (key === "AIRPORT") return ["Bombards enemy territory within 30 tiles", "Requires nearby Aether Tower power"];
    if (key === "AETHER_TOWER") return ["Powers nearby Sky Docks, Resonance Grids, and monuments within 30 tiles", "Can chain power through other Aether Towers within 30 tiles"];
    if (key === "RADAR_SYSTEM") return ["Blocks enemy bombardment within 30 tiles", "Requires nearby Aether Tower power"];
    if (key === "ASTRAL_DOCK_PART") return ["One of three required monument parts", "Must be built in different Great Cities or Monumental Cities"];
    if (key === "ASTRAL_DOCK") return ["Unique world monument", "Launches one satellite for 24 hours of full-map vision every 90 minutes for 300 crystal", "Requires nearby Aether Tower power"];
    if (key === "RAIL_DEPOT") return ["Every 10 minutes, settles the nearest owned frontier tile within 20 tiles", "+10 connected-town income points across this town's linked network"];
    if (key === "WEATHER_ENGINE") return ["Blocks hostile bombardment within 30 tiles", "Blocks hostile observatory actions within 30 tiles"];
    if (key === "IMPERIAL_EXCHANGE_PART" || key === "WORLD_ENGINE_PART" || key === "AEGIS_DOME_PART") return ["One of three required monument parts", "Must be built in different Great Cities or Monumental Cities"];
    if (key === "IMPERIAL_EXCHANGE") return ["Unique world monument", "Levy one resource from all rivals every 60 minutes for 240 crystal", "Requires nearby Aether Tower power"];
    if (key === "AEGIS_DOME") return ["Unique world monument", "Blocks hostile bombardment and hostile crystal actions within 25 tiles", "Aegis Lock prevents hostile ownership changes in that radius for 15 minutes every 60 minutes at 220 crystal", "Requires nearby Aether Tower power"];
    if (key === "WORLD_ENGINE") return ["Unique world monument", "Fires one Worldbreaker shot that shatters an enemy land tile into mountain every 90 minutes for 300 crystal", "Requires nearby Aether Tower power"];
    return [];
  };
  const structure = (base: Omit<StructureInfoView, "image" | "effects" | "upkeepBits">, image?: string): StructureInfoView =>
    image ? { ...base, effects: effectsFor(type), upkeepBits: upkeepBitsFor(type), image } : { ...base, effects: effectsFor(type), upkeepBits: upkeepBitsFor(type) };
  const imageFor = (key: StructureInfoKey): string | undefined => {
    if (key === "MARKET") return "/overlays/market-overlay.svg";
    if (key === "GRANARY") return "/overlays/granary-overlay.svg";
    if (key === "CENSUS_HALL") return "/overlays/governors-office-overlay.svg";
    if (key === "OBSERVATORY") return "/overlays/observatory-overlay.svg";
    if (key === "BANK") return "/overlays/bank-overlay.svg";
    if (key === "CARAVANARY") return "/overlays/caravanary-overlay.svg";
    if (key === "FUR_SYNTHESIZER") return "/overlays/fur-synthesizer-overlay.svg";
    if (key === "ADVANCED_FUR_SYNTHESIZER") return "/overlays/advanced-fur-synthesizer-overlay.svg";
    if (key === "IRONWORKS") return "/overlays/ironworks-overlay.svg";
    if (key === "ADVANCED_IRONWORKS") return "/overlays/advanced-ironworks-overlay.svg";
    if (key === "CRYSTAL_SYNTHESIZER") return "/overlays/crystal-synthesizer-overlay.svg";
    if (key === "ADVANCED_CRYSTAL_SYNTHESIZER") return "/overlays/advanced-crystal-synthesizer-overlay.svg";
    if (key === "FOUNDRY") return "/overlays/foundry-overlay.svg";
    if (key === "ADVANCED_FOUNDRY") return "/overlays/foundry-overlay.svg";
    if (key === "EXCHANGE_HOUSE") return "/overlays/exchange-house-overlay.svg";
    if (key === "CUSTOMS_HOUSE") return "/overlays/customs-house-overlay.svg";
    if (key === "CLEARING_HOUSE") return "/overlays/clearing-house-overlay.svg";
    if (key === "GOVERNORS_OFFICE") return "/overlays/governors-office-overlay.svg";
    if (key === "GARRISON_HALL") return "/overlays/garrison-hall-overlay.svg";
    if (key === "AIRPORT") return "/overlays/airport-overlay.svg";
    if (key === "RADAR_SYSTEM") return "/overlays/radar-system-overlay.svg";
    if (key === "AETHER_TOWER") return "/overlays/radar-system-overlay.svg";
    if (key === "ASTRAL_DOCK_PART") return "/overlays/astral-dock-overlay.svg";
    if (key === "AEGIS_DOME") return "/overlays/aegis-dome-overlay.svg";
    if (key === "AEGIS_DOME_PART") return "/overlays/aegis-dome-overlay.svg";
    if (key === "ASTRAL_DOCK") return "/overlays/astral-dock-overlay.svg";
    if (key === "RAIL_DEPOT") return "/overlays/rail-depot-overlay.svg";
    if (key === "IMPERIAL_EXCHANGE_PART") return "/overlays/imperial-exchange-overlay.svg";
    if (key === "IMPERIAL_EXCHANGE") return "/overlays/imperial-exchange-overlay.svg";
    if (key === "WORLD_ENGINE_PART") return "/overlays/world-engine-overlay.svg";
    if (key === "WORLD_ENGINE") return "/overlays/world-engine-overlay.svg";
    return undefined;
  };
  const costBitsFor = (key: StructureInfoKey): string[] => {
    if (key === "IRON_BASTION") return ["1,800 gold", "90 iron"];
    if (key === "THUNDER_BASTION") return ["4,200 gold", "180 iron"];
    if (key === "SIEGE_TOWER") return ["1,800 gold", "90 supply", "60 iron"];
    if (key === "DREAD_TOWER") return ["4,200 gold", "140 supply", "120 iron"];
    const def = structureCostDefinition(structureBaseKey(key));
    const bits = [`${def.baseGoldCost.toLocaleString()} gold`];
    if (def.resourceCost) bits.push(`${def.resourceCost.amount} ${deps.prettyToken(def.resourceCost.resource).toLowerCase()}`);
    else if (def.resourceOptions?.length) bits.push("30 iron or crystal");
    return bits;
  };
  if (type === "FORT") {
    return structure({
      title: "Fort",
      detail: "Forts add fortified defense on border or dock tiles. An active fort also stops that origin tile from being counter-taken when your attack fails.",
      glyph: "🛡",
      placement: "Build on a settled border tile or dock you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "IRON_BASTION") {
    return structure({
      title: "Iron Bastion",
      detail: "Iron Bastions upgrade standard Forts and raise their defense from 2.5x to 4x while Bastion Walls also adds +10% settled defense.",
      glyph: "🛡",
      placement: "Upgrade an existing Fort on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "THUNDER_BASTION") {
    return structure({
      title: "Thunder Bastion",
      detail: "Thunder Bastions upgrade Iron Bastions and raise fort defense from 4x to 8x, turning fortified cores into genuine siege problems.",
      glyph: "🛡",
      placement: "Upgrade an existing Iron Bastion on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "OBSERVATORY") {
    return structure({
      title: "Observatory",
      detail: "Observatories add local vision, protect against hostile crystal actions, and let you cast crystal abilities inside their radius.",
      glyph: "◉",
      placement: "Build on empty settled land only. Not on towns, docks, or resource tiles.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WOODEN_FORT") {
    return structure({
      title: "Wooden Fort",
      detail: "Wooden forts provide a lighter defensive anchor on border and dock tiles without consuming iron upkeep.",
      glyph: "🪵",
      placement: "Build on an owned border tile or dock with no town, resource, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "FARMSTEAD") {
    return structure({
      title: "Farmstead",
      detail: "Farmsteads increase food production on farm tiles by 50% and add +18 food cap. They have no effect on fish tiles.",
      glyph: "🌾",
      placement: "Build on a settled farm resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "CAMP") {
    return structure({
      title: "Camp",
      detail: "Camps increase supply production on wood and fur tiles by 50% and add +15 supply cap.",
      glyph: "🦊",
      placement: "Build on a settled wood or fur resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MINE") {
    return structure({
      title: "Mine",
      detail: "Mines increase iron or crystal production on mineral tiles by 50%. Iron mines add +15 iron cap; crystal mines add +9 crystal cap.",
      glyph: "⛏",
      placement: "Build on a settled iron or crystal resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MARKET") {
    return structure({
      title: "Market",
      detail: "Markets are built on a town support tile. They increase that town's gold production by 50%; higher gold production raises your gold cap.",
      glyph: "◌",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GRANARY") {
    return structure({
      title: "Granary",
      detail: "Granaries are built on a town support tile. They strengthen nearby farmsteads within 10 tiles and reduce the supported town's food upkeep.",
      glyph: "🍞",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_HALL") {
    return structure({
      title: "Census Hall",
      detail: "Census Halls are built on a town support tile. They add +25% local population growth.",
      glyph: "⌘",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "BANK") {
    return structure({
      title: "Bank",
      detail: "Banks are built on a town support tile. They increase city income by 50% and add +1 flat income.",
      glyph: "🏦",
      placement: "Build on an open settled support tile for a city or larger town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CLEARING_HOUSE") {
    return structure({
      title: "Clearing House",
      detail: "Clearing Houses are built on a town support tile. One active clearing house gives this town and its directly connected towns +25% Market effect, +20% Bank effect, and +0.5 flat Bank income.",
      glyph: "⌂",
      placement: "Build on an open settled support tile for a town with a connected city network.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CARAVANARY") {
    return structure({
      title: "Caravanary",
      detail: "Caravanaries are built on a town support tile. They increase that town's connected-town income bonus by 25%.",
      glyph: "🐪",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "FUR_SYNTHESIZER") {
    return structure({
      title: "Fur Synthesizer",
      detail: "Fur Synthesizers convert gold upkeep into 18 supply per day on a support tile.",
      glyph: "📦",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_FUR_SYNTHESIZER") {
    return structure({
      title: "Advanced Fur Synthesizer",
      detail: "Advanced Fur Synthesizers upgrade an existing Fur Synthesizer from 18 to 21.6 supply per day.",
      glyph: "🧵",
      placement: "Upgrade an existing Fur Synthesizer on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "LIGHT_OUTPOST") {
    return structure({
      title: "Light Outpost",
      detail: "Light outposts are cheaper offensive staging points that keep the 5 gold / m upkeep but do not use the Siege Outpost +25% offense profile.",
      glyph: "⚑",
      placement: "Build on an owned border tile with no town, resource, dock, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "SIEGE_TOWER") {
    return structure({
      title: "Siege Tower",
      detail: "Siege Towers upgrade Siege Outposts and raise their attack from 1.25x to 2x.",
      glyph: "⚔",
      placement: "Upgrade an existing Siege Outpost on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "DREAD_TOWER") {
    return structure({
      title: "Dread Tower",
      detail: "Dread Towers upgrade Siege Towers and raise siege attack from 2x to 3x for assaults against the heaviest fortified targets.",
      glyph: "⚔",
      placement: "Upgrade an existing Siege Tower on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "IRONWORKS") {
    return structure({
      title: "Ironworks",
      detail: "Ironworks convert gold upkeep into 18 iron per day on a support tile.",
      glyph: "⚙",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_IRONWORKS") {
    return structure({
      title: "Advanced Ironworks",
      detail: "Advanced Ironworks upgrade an existing Ironworks from 18 to 21.6 iron per day.",
      glyph: "⚙",
      placement: "Upgrade an existing Ironworks on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Aether Condenser",
      detail: "Aether Condensers convert gold upkeep into 12 crystal per day on a support tile.",
      glyph: "💎",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ADVANCED_CRYSTAL_SYNTHESIZER") {
    return structure({
      title: "Advanced Aether Condenser",
      detail: "Advanced Aether Condensers upgrade an existing Aether Condenser from 12 to 14.4 crystal per day.",
      glyph: "💠",
      placement: "Upgrade an existing Aether Condenser on its current support tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "FOUNDRY") {
    return structure({
      title: "Foundry",
      detail: "Foundries double active mine production within 5 tiles. Boosted mine production also raises iron and crystal caps.",
      glyph: "🏭",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CUSTOMS_HOUSE") {
    return structure({
      title: "Harbor Exchange",
      detail: "Harbor exchanges are built beside a dock and add +1 gold per minute for each connected owned dock.",
      glyph: "⚓",
      placement: "Build on a settled dock tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASTRAL_DOCK_PART") {
    return structure({
      title: "Astral Dock Part",
      detail: "Astral Dock Parts are the three giant monument sections needed before the final Astral Dock can be assembled anywhere on owned settled land.",
      glyph: "✶",
      placement: "Build in three different Great Cities or Monumental Cities on support tiles you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASTRAL_DOCK") {
    return structure({
      title: "Astral Dock",
      detail: "The Astral Dock is a unique world monument. Once assembled and powered, it can launch one satellite that reveals the full map for 24 hours.",
      glyph: "✶",
      placement: "Place for free on any settled tile you own after finishing three Astral Dock Parts.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RAIL_DEPOT") {
    return structure({
      title: "Rail Depot",
      detail: "Rail Depots settle the nearest owned frontier tile within 20 tiles every 10 minutes and add +10 connected-town income points across the supported town's directly connected network.",
      glyph: "🚉",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WATERWORKS") {
    return structure({
      title: "Waterworks",
      detail: "A network of irrigation canals that boosts all Farmstead food production by +50% within a 10-tile radius. Boosted food production also raises food cap.",
      glyph: "💧",
      placement: "Build on any settled land tile. Does not need a resource tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "EXCHANGE_HOUSE") {
    return structure({
      title: "Exchange House",
      detail: "Exchange Houses are built on great-city support tiles. Each adjacent active support structure adds +10% gold and +5% growth, capped at +80% gold and +40% growth.",
      glyph: "¤",
      placement: "Build on an open settled support tile for a Great City or Monumental City you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GOVERNORS_OFFICE") {
    return structure({
      title: "Ministry Hall",
      detail: "Ministry halls reduce local town food upkeep and settled-tile upkeep within 10 tiles.",
      glyph: "🏛",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GARRISON_HALL") {
    return structure({
      title: "Garrison Hall",
      detail: "Garrison halls increase settled-tile defense by 20% within 10 tiles.",
      glyph: "🪖",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AIRPORT") {
    return structure({
      title: "Sky Dock",
      detail: "Sky Docks launch crystal-powered bombardments against enemy territory within 30 tiles for 20 crystal per shot and require Aether Tower power.",
      glyph: "✈",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AETHER_TOWER") {
    return structure({
      title: "Aether Tower",
      detail: "Aether Towers create a 30-tile power radius for late-game sky and monument structures. Chain them across your empire to keep advanced systems online.",
      glyph: "⚡",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RADAR_SYSTEM") {
    return structure({
      title: "Resonance Grid",
      detail: "Resonance Grids block enemy sky bombardment within 30 tiles and reveal the origin. They require Aether Tower power.",
      glyph: "📡",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE_PART") {
    return structure({
      title: "Imperial Exchange Part",
      detail: "One of three monument parts required before you can place the final Imperial Exchange for free.",
      glyph: "◈",
      placement: "Build on an open support tile for a Great City or Monumental City you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WORLD_ENGINE_PART") {
    return structure({
      title: "Worldbreaker Cannon Part",
      detail: "One of three monument parts required before you can place the final Worldbreaker Cannon for free.",
      glyph: "⬢",
      placement: "Build on an open support tile for a Great City or Monumental City you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE") {
    return structure({
      title: "Imperial Exchange",
      detail: "Unique world monument. Once the three parts are complete, place it for free on any settled tile you own and levy one resource from every rival empire every 60 minutes for 240 crystal.",
      glyph: "✶",
      placement: "Place on any settled tile you own after finishing 3 Imperial Exchange Parts.",
      costBits: ["Free after 3 parts"],
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WORLD_ENGINE") {
    return structure({
      title: "Worldbreaker Cannon",
      detail: "Unique world monument. Once the three parts are complete, place it for free on any settled tile you own and fire one Worldbreaker shot that shatters an enemy land tile into mountain every 90 minutes for 300 crystal.",
      glyph: "✸",
      placement: "Place on any settled tile you own after finishing 3 Worldbreaker Cannon Parts.",
      costBits: ["Free after 3 parts"],
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AEGIS_DOME_PART") {
    return structure({
      title: "Aegis Dome Part",
      detail: "One of three monument parts required before you can place the final Aegis Dome for free.",
      glyph: "⬡",
      placement: "Build on an open support tile for a Great City or Monumental City you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AEGIS_DOME") {
    return structure({
      title: "Aegis Dome",
      detail: "Unique world monument. Once the three parts are complete, place it for free on any settled tile you own to shield a 25-tile core and trigger a 15-minute Aegis Lock every 60 minutes for 220 crystal.",
      glyph: "⬡",
      placement: "Place on any settled tile you own after finishing 3 Aegis Dome Parts.",
      costBits: ["Free after 3 parts"],
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  return structure({
    title: "Siege Outpost",
    detail: "Siege outposts are offensive staging structures for border tiles. They add +25% local offense to attacks launched from their tile.",
    glyph: "⚔",
    placement: "Build on a settled border tile you own.",
    costBits: costBitsFor(type),
    buildTimeLabel: buildTimeLabelFor(type)
  });
};

export const structureInfoButtonHtml = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string },
  label?: string
): string => `<button class="inline-info-link" type="button" data-structure-info="${type}">${label ?? structureInfoForKey(type, deps).title}</button>`;

export const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "FISH") return "#6ec9ff";
  if (resource === "FUR") return "#d6b48a";
  if (resource === "WOOD") return "#7b4f2c";
  if (resource === "IRON") return "#c7ced8";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};

export const resourceLabel = (resource: string | undefined): string => {
  if (resource === "FARM") return "GRAIN";
  if (resource === "FUR") return "FUR";
  if (resource === "FISH") return "FISH";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "GEMS";
  if (resource === "WOOD") return "WOOD";
  return resource ?? "";
};

export const resourceIconForKey = (resource: string): string => {
  if (resource === "GOLD") return "◉";
  if (resource === "FOOD") return "🍞";
  if (resource === "IRON") return "⛏";
  if (resource === "CRYSTAL") return "💎";
  if (resource === "SUPPLY") return "🦊";
  if (resource === "SHARD") return "✦";
  return "•";
};

export const strategicResourceKeyForTile = (tile: Tile): "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | undefined => {
  if (tile.resource === "FARM" || tile.resource === "FISH") return "FOOD";
  if (tile.resource === "IRON") return "IRON";
  if (tile.resource === "GEMS") return "CRYSTAL";
  if (tile.resource === "WOOD" || tile.resource === "FUR") return "SUPPLY";
  return undefined;
};

export const tileProductionHtml = (tile: Tile): string => {
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, value]) => Number(value) > 0)
    .map(([resource, value]) => `${resourceIconForKey(resource)} ${Number(value).toFixed(1)}/day`);
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  const parts: string[] = [];
  if (tile.town || gpm > 0) parts.push(`${resourceIconForKey("GOLD")} ${gpm.toFixed(2)}/m`);
  parts.push(...prodStrategic);
  return parts.join(" · ");
};

export const tileUpkeepHtml = (tile: Tile): string => {
  const upkeepFromEntries = { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 };
  for (const entry of tile.upkeepEntries ?? []) {
    upkeepFromEntries.food += Number(entry.perMinute.FOOD ?? 0);
    upkeepFromEntries.iron += Number(entry.perMinute.IRON ?? 0);
    upkeepFromEntries.supply += Number(entry.perMinute.SUPPLY ?? 0);
    upkeepFromEntries.crystal += Number(entry.perMinute.CRYSTAL ?? 0);
    upkeepFromEntries.oil += Number(entry.perMinute.OIL ?? 0);
    upkeepFromEntries.gold += Number(entry.perMinute.GOLD ?? 0);
  }
  const parts: string[] = [];
  if (upkeepFromEntries.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeepFromEntries.food.toFixed(2)}/m`);
  if (upkeepFromEntries.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeepFromEntries.iron.toFixed(2)}/m`);
  if (upkeepFromEntries.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeepFromEntries.supply.toFixed(2)}/m`);
  if (upkeepFromEntries.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeepFromEntries.crystal.toFixed(2)}/m`);
  if (upkeepFromEntries.oil > 0.001) parts.push(`${resourceIconForKey("OIL")} ${upkeepFromEntries.oil.toFixed(2)}/m`);
  if (upkeepFromEntries.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeepFromEntries.gold.toFixed(2)}/m`);
  if (parts.length > 0) return parts.join(" · ");
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number") parts.push(`${resourceIconForKey("FOOD")} ${tile.town.foodUpkeepPerMinute.toFixed(2)}/m`);
  if (tile.observatory?.status === "active") parts.push(`${resourceIconForKey("CRYSTAL")} ${OBSERVATORY_UPKEEP_PER_MIN.toFixed(2)}/m`);
  return parts.join(" · ");
};

export const storedYieldSummary = (tile: Tile, options?: { alwaysShowOwnedTownGold?: boolean }): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = tile.yieldCap?.gold ?? 0;
  const canStoreGold = Boolean(tile.town || tile.dockId || (tile.yieldRate?.goldPerMinute ?? 0) > 0.01 || gold > 0.01);
  const alwaysShowOwnedTownGold = options?.alwaysShowOwnedTownGold === true;
  if (canStoreGold && (gold > 0.01 || goldCap > 0 || alwaysShowOwnedTownGold)) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${goldCap.toFixed(0)}`);
  }
  const strategicCap = tile.yieldCap?.strategicEach ?? 0;
  const strategicEntries = new Map<string, number>(
    Object.entries(tile.yield?.strategic ?? {}).map(([resource, value]) => [resource, Number(value)])
  );
  const primaryStrategic = strategicResourceKeyForTile(tile);
  if (primaryStrategic && strategicCap > 0 && !strategicEntries.has(primaryStrategic)) strategicEntries.set(primaryStrategic, 0);
  for (const [resource, value] of strategicEntries) {
    if (Number(value) <= 0.01 && strategicCap <= 0) continue;
    parts.push(`${resourceIconForKey(resource)} ${Number(value).toFixed(2)} / ${strategicCap.toFixed(1)}`);
  }
  return parts.join(" · ");
};

const yieldCapForResource = (tile: Tile, resource: string): number | undefined => {
  if (!tile.yieldCap) return undefined;
  if (resource === "GOLD") return tile.yieldCap.gold;
  if (resource === "FOOD" || resource === "IRON" || resource === "CRYSTAL" || resource === "SUPPLY" || resource === "SHARD") {
    return tile.yieldCap.strategicEach;
  }
  return undefined;
};

export const formatYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = yieldCapForResource(tile, "GOLD");
  if (gold > 0.01 || (goldCap ?? 0) > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${(goldCap ?? 0).toFixed(1)}`);
  }
  for (const key of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = Number(tile.yield?.strategic?.[key] ?? 0);
    const cap = yieldCapForResource(tile, key);
    if (amount <= 0.01 && (cap ?? 0) <= 0) continue;
    parts.push(`${resourceIconForKey(key)} ${amount.toFixed(1)} / ${(cap ?? 0).toFixed(1)}`);
  }
  return parts.length > 0 ? `Yield: ${parts.join("  ")}` : "";
};

export const formatUpkeepSummary = (upkeep: { food: number; iron: number; supply: number; crystal: number; gold: number }): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${upkeep.food.toFixed(2)}/m`);
  if (upkeep.iron > 0.001) parts.push(`${resourceIconForKey("IRON")} ${upkeep.iron.toFixed(2)}/m`);
  if (upkeep.supply > 0.001) parts.push(`${resourceIconForKey("SUPPLY")} ${upkeep.supply.toFixed(2)}/m`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${upkeep.crystal.toFixed(2)}/m`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${upkeep.gold.toFixed(2)}/m`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};
