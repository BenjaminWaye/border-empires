import type { FortificationOpening, FortificationOverlayKind } from "../client-fortification-overlays/client-fortification-overlays.js";

// Overlay sprite loading for the 2D canvas renderer. Lives in its own
// module so structureOverlayImages can grow without pushing
// client-map-render.ts over the 500-line cap. Sprites are 128x128 SVGs
// in packages/client/public/overlays/, cache-busted by
// overlayAssetVersion — bump it whenever overlay art changes.

const overlayAssetVersion = "20260810b";
export const overlaySrc = (filename: string): string => `/overlays/${filename}?v=${overlayAssetVersion}`;
const loadOverlayImage = (filename: string): HTMLImageElement => {
  const image = new Image();
  image.decoding = "async";
  image.src = overlaySrc(filename);
  return image;
};
export const createOverlayVariantSet = (filenames: readonly string[]): HTMLImageElement[] => filenames.map(loadOverlayImage);
const createDirectionalOverlaySet = (
  prefix: string,
  variant: "open" | "direction" | "static" = "open"
): Record<FortificationOpening, HTMLImageElement> => {
  if (variant === "static") {
    const image = loadOverlayImage(`${prefix}.svg`);
    return { CLOSED: image, NORTH: image, EAST: image, SOUTH: image, WEST: image };
  }
  const suffixFor = (direction: Exclude<FortificationOpening, "CLOSED">): string =>
    variant === "direction" ? direction.toLowerCase() : `open-${direction.toLowerCase()}`;
  return {
    CLOSED: loadOverlayImage(`${prefix}-closed.svg`),
    NORTH: loadOverlayImage(`${prefix}-${suffixFor("NORTH")}.svg`),
    EAST: loadOverlayImage(`${prefix}-${suffixFor("EAST")}.svg`),
    SOUTH: loadOverlayImage(`${prefix}-${suffixFor("SOUTH")}.svg`),
    WEST: loadOverlayImage(`${prefix}-${suffixFor("WEST")}.svg`)
  };
};

export const aetherBridgeAnchorImage = loadOverlayImage("aether-pylon-overlay.svg");
export const aetherWallPylonImage = loadOverlayImage("aether-wall-pylon-overlay.svg");

export const dockOverlayVariants = createOverlayVariantSet(["dock-overlay-1.svg", "dock-overlay-2.svg", "dock-overlay-3.svg"]);
export const structureOverlayImages = {
  OBSERVATORY: loadOverlayImage("observatory-overlay.svg"),
  MARKET: loadOverlayImage("market-overlay.svg"),
  GRANARY: loadOverlayImage("incubation-engine-overlay.svg"),
  CLEARING_HOUSE: loadOverlayImage("clearing-house-overlay.svg"),
  AIRPORT: loadOverlayImage("airport-overlay.svg"),
  UMBRITE_SYNTHESIZER: loadOverlayImage("umbrite-synthesizer-overlay.svg"),
  ADVANCED_UMBRITE_SYNTHESIZER: loadOverlayImage("advanced-umbrite-synthesizer-overlay.svg"),
  TITANIUM_WORKS: loadOverlayImage("titanium-works-overlay.svg"),
  ADVANCED_TITANIUM_WORKS: loadOverlayImage("advanced-titanium-works-overlay.svg"),
  CRYSTAL_SYNTHESIZER: loadOverlayImage("crystal-synthesizer-overlay.svg"),
  ADVANCED_CRYSTAL_SYNTHESIZER: loadOverlayImage("advanced-crystal-synthesizer-overlay.svg"),
  CARAVANARY: loadOverlayImage("caravanary-overlay.svg"),
  FOUNDRY: loadOverlayImage("foundry-overlay.svg"),
  GARRISON_HALL: loadOverlayImage("ancillary-factory-overlay.svg"),
  CUSTOMS_HOUSE: loadOverlayImage("customs-house-overlay.svg"),
  RAIL_DEPOT: loadOverlayImage("rail-depot-overlay.svg"),
  GOVERNORS_OFFICE: loadOverlayImage("governors-office-overlay.svg"),
  RADAR_SYSTEM: loadOverlayImage("radar-system-overlay.svg"),
  AETHER_TOWER: loadOverlayImage("ambaric-tower-overlay.svg"),
  AEGIS_DOME: loadOverlayImage("aegis-dome-overlay.svg"),
  ASTRAL_DOCK: loadOverlayImage("astral-dock-overlay.svg"),
  IMPERIAL_EXCHANGE: loadOverlayImage("imperial-exchange-overlay.svg"),
  WORLD_ENGINE: loadOverlayImage("world-engine-overlay.svg"),
  QUARTERMASTERS_OFFICE: loadOverlayImage("quartermasters-office-overlay.svg"),
  LOGISTICS_GUILD: loadOverlayImage("logistics-guild-overlay.svg"),
  ASSEMBLY_WORKS: loadOverlayImage("assembly-works-overlay.svg"),
  POPULATION_BUREAU: loadOverlayImage("population-bureau-overlay.svg"),
  TITANIUM_LEVY: loadOverlayImage("titanium-levy-overlay.svg"),
  SEED_GRANARY: loadOverlayImage("seed-granary-overlay.svg"),
  CENSUS_HALL: loadOverlayImage("census-hall-overlay.svg"),
  WEAPONS_WORKSHOP: loadOverlayImage("weapons-workshop-overlay.svg"),
  TITANIUM_WEAPONS_FACTORY: loadOverlayImage("titanium-weapons-factory-overlay.svg"),
  UMBRITE_WEAPONS_FACTORY: loadOverlayImage("umbrite-weapons-factory-overlay.svg"),
  WORLD_ENGINE_PART_1: loadOverlayImage("long-barrel-overlay.svg"),
  WORLD_ENGINE_PART_2: loadOverlayImage("fracture-core-overlay.svg"),
  WORLD_ENGINE_PART_3: loadOverlayImage("sky-marking-array-overlay.svg"),
  IMPERIAL_EXCHANGE_PART_1: loadOverlayImage("golden-ledger-overlay.svg"),
  IMPERIAL_EXCHANGE_PART_2: loadOverlayImage("counting-engine-overlay.svg"),
  IMPERIAL_EXCHANGE_PART_3: loadOverlayImage("sovereign-seal-overlay.svg")
} as const;

export const naturalWonderOverlayImages = {
  FOUNDRY_HEART: loadOverlayImage("foundry-heart-overlay.svg"),
  DEEPWATER_ENGINE: loadOverlayImage("deepwater-engine-overlay.svg"),
  CONSCRIPTION_ENGINE: loadOverlayImage("conscription-engine-overlay.svg"),
  WARPRESS: loadOverlayImage("warpress-overlay.svg"),
  BASTION_FRAME: loadOverlayImage("bastion-frame-overlay.svg"),
  CALCULATING_ENGINE: loadOverlayImage("calculating-engine-overlay.svg"),
  QUICKFORGE: loadOverlayImage("quickforge-overlay.svg"),
  WATCHTOWER_ENGINE: loadOverlayImage("watchtower-engine-overlay.svg"),
  CARTOGRAPHERS_LENS: loadOverlayImage("cartographers-lens-overlay.svg")
} as const;
const fortRingOverlaySet = createDirectionalOverlaySet("fort-ring-overlay"); // also stands in for TITANIUM_BASTION/THUNDER_BASTION (3D-only art)
export const fortificationOverlayImages: Record<FortificationOverlayKind, Record<FortificationOpening, HTMLImageElement>> = {
  FORT: fortRingOverlaySet, TITANIUM_BASTION: fortRingOverlaySet, THUNDER_BASTION: fortRingOverlaySet,
  SIEGE_OUTPOST: createDirectionalOverlaySet("siege-outpost-overlay", "static"),
  WOODEN_FORT: createDirectionalOverlaySet("wooden-fort-ring-overlay"),
  LIGHT_OUTPOST: createDirectionalOverlaySet("light-outpost-overlay", "static")
};
