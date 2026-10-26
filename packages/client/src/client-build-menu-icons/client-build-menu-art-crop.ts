import { infrastructureMenuCrops } from "../client-infrastructure/infrastructure-art.js";
import { monumentMenuCrops } from "../client-monuments/monument-art.js";
import { districtMenuArtCrops } from "../client-town-district/district-art.js";
// Where each building's art sits inside its overlay SVG, as fractions of the
// (square) SVG canvas: [x, y, width, height]. The overlays are drawn to sit on
// a map tile, so most buildings only fill part of the canvas; the build menu
// crops to this box so every thumbnail fills its slot. Legacy bounds use
// rendered alpha > 24/255; district bounds are generated from vector paths.
// client-build-menu-icons.test.ts fails if a build-menu art file is missing here.

export type ArtCropBox = readonly [x: number, y: number, width: number, height: number];

export const BUILD_MENU_ART_CROP: Readonly<Record<string, ArtCropBox>> = {
  ...districtMenuArtCrops(),
  ...monumentMenuCrops(),
  ...infrastructureMenuCrops(),
  "/overlays/high-yield-aether-condenser-overlay.svg": [0.078, 0.289, 0.789, 0.5],
  "/overlays/high-yield-titanium-works-overlay.svg": [0.078, 0.23, 0.789, 0.594],
  "/overlays/high-yield-umbrite-works-overlay.svg": [0.078, 0.199, 0.785, 0.648],
  "/overlays/aether-sail-overlay.svg": [0.063, 0.094, 0.859, 0.734],
  "/overlays/sky-dock-overlay.svg": [0.141, 0.313, 0.82, 0.484],
  "/overlays/ambaric-tower-overlay.svg": [0.25, 0.047, 0.5, 0.75],
  "/overlays/ancillary-depot-overlay.svg": [0.105, 0.105, 0.789, 0.789],
  "/overlays/ancillary-factory-overlay.svg": [0.156, 0.195, 0.688, 0.602],
  "/overlays/neural-works-overlay.svg": [0.078, 0.375, 0.844, 0.406],
  "/overlays/bank-overlay.svg": [0.141, 0.422, 0.594, 0.379],
  "/overlays/census-engine-overlay.svg": [0.125, 0.172, 0.813, 0.656],
  "/overlays/census-hall-overlay.svg": [0.141, 0.453, 0.594, 0.344],
  "/overlays/clearing-house-overlay.svg": [0.125, 0.438, 0.734, 0.391],
  "/overlays/counting-engine-overlay.svg": [0.156, 0.297, 0.563, 0.547],
  "/overlays/aether-condenser-overlay.svg": [0.109, 0.477, 0.703, 0.32],
  "/overlays/exchange-house-overlay.svg": [0.125, 0.453, 0.688, 0.348],
  "/overlays/farm-hydrogarden-overlay-1.svg": [0.082, 0.219, 0.699, 0.563],
  "/overlays/farm-hydroponic-overlay-1.svg": [0.172, 0.145, 0.656, 0.676],
  "/overlays/fort-ring-overlay-closed.svg": [0.016, 0.031, 0.969, 0.969],
  "/overlays/ore-refinery-overlay.svg": [0.109, 0.398, 0.727, 0.418],
  "/overlays/fracture-core-overlay.svg": [0.141, 0.102, 0.578, 0.727],
  "/overlays/golden-ledger-overlay.svg": [0.172, 0.438, 0.547, 0.391],
  "/overlays/ministry-hall-overlay.svg": [0.109, 0.438, 0.742, 0.344],
  "/overlays/incubation-engine-overlay.svg": [0.094, 0.375, 0.688, 0.422],
  "/overlays/launch-cradle-overlay.svg": [0.063, 0.238, 0.859, 0.59],
  "/overlays/levy-charter-overlay.svg": [0.375, 0.313, 0.297, 0.516],
  "/overlays/long-barrel-overlay.svg": [0.141, 0.344, 0.766, 0.5],
  "/overlays/manufactory-overlay.svg": [0.06, 0.07, 0.89, 0.90],
  "/overlays/orbital-array-overlay.svg": [0.063, 0.176, 0.859, 0.652],
  "/overlays/quartermasters-office-overlay.svg": [0.109, 0.395, 0.797, 0.402],
  "/overlays/resonance-grid-overlay.svg": [0.125, 0.223, 0.637, 0.582],
  "/overlays/reserve-lattice-overlay.svg": [0.109, 0.484, 0.758, 0.367],
  "/overlays/registry-vault-overlay.svg": [0.141, 0.484, 0.609, 0.375],
  "/overlays/siege-battery-overlay.svg": [0.184, 0.359, 0.633, 0.625],
  "/overlays/sky-marking-array-overlay.svg": [0.156, 0.102, 0.699, 0.742],
  "/overlays/sovereign-seal-overlay.svg": [0.172, 0.359, 0.547, 0.469],
  "/overlays/titanium-weapons-factory-overlay.svg": [0.141, 0.434, 0.641, 0.316],
  "/overlays/titanium-works-overlay.svg": [0.109, 0.344, 0.719, 0.48],
  "/overlays/trade-nexus-overlay.svg": [0.117, 0.094, 0.883, 0.863],
  "/overlays/umbrite-works-overlay.svg": [0.133, 0.297, 0.641, 0.547],
  "/overlays/umbrite-weapons-factory-overlay.svg": [0.141, 0.094, 0.672, 0.813],
  "/overlays/weapons-workshop-overlay.svg": [0.141, 0.313, 0.641, 0.438],
  "/overlays/palisade-ring-overlay-closed.svg": [0.016, 0.031, 0.969, 0.969],
};
