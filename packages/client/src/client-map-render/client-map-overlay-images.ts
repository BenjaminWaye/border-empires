import type { FortificationOpening, FortificationOverlayKind } from "../client-fortification-overlays/client-fortification-overlays.js";

// Overlay sprite loading for the 2D canvas renderer. Lives in its own
// module so structureOverlayImages can grow without pushing
// client-map-render.ts over the 500-line cap. Sprites are 128x128 SVGs
// in packages/client/public/overlays/, cache-busted by
// overlayAssetVersion — bump it whenever overlay art changes.

const overlayAssetVersion = "20260805a";
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
  FUR_SYNTHESIZER: loadOverlayImage("fur-synthesizer-overlay.svg"),
  ADVANCED_FUR_SYNTHESIZER: loadOverlayImage("advanced-fur-synthesizer-overlay.svg"),
  IRONWORKS: loadOverlayImage("ironworks-overlay.svg"),
  ADVANCED_IRONWORKS: loadOverlayImage("advanced-ironworks-overlay.svg"),
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
  ASTRAL_DOCK_PART_1: loadOverlayImage("launch-cradle-overlay.svg"),
  ASTRAL_DOCK_PART_2: loadOverlayImage("orbital-array-overlay.svg"),
  ASTRAL_DOCK_PART_3: loadOverlayImage("aether-sail-overlay.svg"),
  IMPERIAL_EXCHANGE: loadOverlayImage("imperial-exchange-overlay.svg"),
  WORLD_ENGINE: loadOverlayImage("world-engine-overlay.svg"),
  QUARTERMASTERS_OFFICE: loadOverlayImage("quartermasters-office-overlay.svg"),
  LOGISTICS_GUILD: loadOverlayImage("logistics-guild-overlay.svg"),
  ASSEMBLY_WORKS: loadOverlayImage("assembly-works-overlay.svg"),
  POPULATION_BUREAU: loadOverlayImage("population-bureau-overlay.svg"),
  IRON_LEVY: loadOverlayImage("iron-levy-overlay.svg")
} as const;
const fortRingOverlaySet = createDirectionalOverlaySet("fort-ring-overlay"); // also stands in for IRON_BASTION/THUNDER_BASTION (3D-only art)
export const fortificationOverlayImages: Record<FortificationOverlayKind, Record<FortificationOpening, HTMLImageElement>> = {
  FORT: fortRingOverlaySet, IRON_BASTION: fortRingOverlaySet, THUNDER_BASTION: fortRingOverlaySet,
  SIEGE_OUTPOST: createDirectionalOverlaySet("siege-outpost-overlay", "static"),
  WOODEN_FORT: createDirectionalOverlaySet("wooden-fort-ring-overlay"),
  LIGHT_OUTPOST: createDirectionalOverlaySet("light-outpost-overlay", "static")
};
