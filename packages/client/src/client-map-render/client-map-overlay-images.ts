import type { FortificationOpening, FortificationOverlayKind } from "../client-fortification-overlays/client-fortification-overlays.js";

// Overlay sprite loading for the 2D canvas renderer. Lives in its own
// module so structureOverlayImages can grow without pushing
// client-map-render.ts over the 500-line cap. Sprites are 128x128 SVGs
// in packages/client/public/overlays/, cache-busted by
// overlayAssetVersion — bump it whenever overlay art changes.

const overlayAssetVersion = "20261012a";
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
  MINTWORKS: loadOverlayImage("mintworks-overlay.svg"),
  INCUBATION_ENGINE: loadOverlayImage("incubation-engine-overlay.svg"),
  CLEARING_HOUSE: loadOverlayImage("clearing-house-overlay.svg"),
  SKY_DOCK: loadOverlayImage("sky-dock-overlay.svg"),
  UMBRITE_WORKS: loadOverlayImage("umbrite-works-overlay.svg"),
  HIGH_YIELD_UMBRITE_WORKS: loadOverlayImage("high-yield-umbrite-works-overlay.svg"),
  TITANIUM_WORKS: loadOverlayImage("titanium-works-overlay.svg"),
  HIGH_YIELD_TITANIUM_WORKS: loadOverlayImage("high-yield-titanium-works-overlay.svg"),
  AETHER_CONDENSER: loadOverlayImage("aether-condenser-overlay.svg"),
  HIGH_YIELD_AETHER_CONDENSER: loadOverlayImage("high-yield-aether-condenser-overlay.svg"),
  TRADE_NEXUS: loadOverlayImage("trade-nexus-overlay.svg"),
  ORE_REFINERY: loadOverlayImage("ore-refinery-overlay.svg"),
  // Manifest tree naming/lore pass: ANCILLARY_DEPOT ("Ancillary Depot") and
  // ANCILLARY_FACTORY ("Ancillary Factory") had their art swapped; the Depot
  // since got its own dedicated storage-drum overlay (and the Factory keeps
  // the hopper-tower manufactory). NEURAL_WORKS ("Neural Works") and
  // RESERVE_LATTICE ("Reserve Lattice") still swap.
  ANCILLARY_DEPOT: loadOverlayImage("ancillary-depot-overlay.svg"),
  HARBOR_EXCHANGE: loadOverlayImage("harbor-exchange-overlay.svg"),
  NEURAL_WORKS: loadOverlayImage("neural-works-overlay.svg"),
  MINISTRY_HALL: loadOverlayImage("ministry-hall-overlay.svg"),
  RESONANCE_GRID: loadOverlayImage("resonance-grid-overlay.svg"),
  AMBARIC_TRANSFORMER: loadOverlayImage("ambaric-tower-overlay.svg"),
  AEGIS_DOME: loadOverlayImage("aegis-dome-overlay.svg"),
  ASTRAL_DOCK: loadOverlayImage("astral-dock-overlay.svg"),
  ASTRAL_DOCK_PART_1: loadOverlayImage("launch-cradle-overlay.svg"),
  ASTRAL_DOCK_PART_2: loadOverlayImage("orbital-array-overlay.svg"),
  ASTRAL_DOCK_PART_3: loadOverlayImage("aether-sail-overlay.svg"),
  IMPERIAL_EXCHANGE: loadOverlayImage("imperial-exchange-overlay.svg"),
  SOVEREIGN_SIEGE_ENGINE: loadOverlayImage("sovereign-siege-engine-overlay.svg"),
  QUARTERMASTERS_OFFICE: loadOverlayImage("quartermasters-office-overlay.svg"),
  ANCILLARY_FACTORY: loadOverlayImage("ancillary-factory-overlay.svg"),
  RESERVE_LATTICE: loadOverlayImage("reserve-lattice-overlay.svg"),
  CENSUS_DIRECTORATE: loadOverlayImage("census-directorate-overlay.svg"),
  TITANIUM_LEVY: loadOverlayImage("titanium-levy-overlay.svg"),
  CENSUS_HALL: loadOverlayImage("census-hall-overlay.svg"),
  WEAPONS_WORKSHOP: loadOverlayImage("weapons-workshop-overlay.svg"),
  TITANIUM_WEAPONS_FACTORY: loadOverlayImage("titanium-weapons-factory-overlay.svg"),
  UMBRITE_WEAPONS_FACTORY: loadOverlayImage("umbrite-weapons-factory-overlay.svg"),
  SOVEREIGN_SIEGE_ENGINE_PART_1: loadOverlayImage("long-barrel-overlay.svg"),
  SOVEREIGN_SIEGE_ENGINE_PART_2: loadOverlayImage("fracture-core-overlay.svg"),
  SOVEREIGN_SIEGE_ENGINE_PART_3: loadOverlayImage("sky-marking-array-overlay.svg"),
  IMPERIAL_EXCHANGE_PART_1: loadOverlayImage("golden-ledger-overlay.svg"),
  IMPERIAL_EXCHANGE_PART_2: loadOverlayImage("counting-engine-overlay.svg"),
  IMPERIAL_EXCHANGE_PART_3: loadOverlayImage("sovereign-seal-overlay.svg"),
  CENSUS_DIRECTORATE_PART_1: loadOverlayImage("census-engine-overlay.svg"),
  CENSUS_DIRECTORATE_PART_2: loadOverlayImage("registry-vault-overlay.svg"),
  CENSUS_DIRECTORATE_PART_3: loadOverlayImage("levy-charter-overlay.svg")
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
  SIEGE_BATTERY: createDirectionalOverlaySet("siege-battery-overlay", "static"),
  PALISADE: createDirectionalOverlaySet("palisade-ring-overlay"),
  RELAY_BEACON: createDirectionalOverlaySet("relay-beacon-overlay", "static")
};
