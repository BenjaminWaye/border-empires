// 3D Hydrogarden overlay ("Hydrogarden") — a futuristic steampunk hydroponic
// farmhouse. A large glass biodome sits low on the tile, ringed by a brass
// footing, caged by three armillary hoops, with three concentric green crop
// tiers circling a bright aether column that rises through the crown as a
// luminous spire. Reads at gameplay distance as "glass greenhouse + glowing
// growth core = farm food".
//
// Built on the shared StructurePieceBuilder so hydrogarden pieces pool with the
// rest of the economic-family instanced meshes; registered from
// client-map-3d-structure-economic.ts.
//
// Width: the dome spans ~0.76 tiles and the hoops ~0.80, so it fills most of
// the tile while staying inside the default contact-shadow footprint
// (DEFAULT_CONTACT_SHADOW_RADIUS_TILES = 0.42). The dome is deliberately a
// FULL sphere whose lower cap sinks below the surface, so it reads as a dome
// seated on the ground with no separate base/pedestal, and so its measured
// top (bounding-box centred on the sphere) matches its real top for the
// construction growth test (a hemisphere would under-measure by R/2).
//
// Construction growth (docs/construction-animation-plan.md): the ground-based
// aether column is the tallest growable piece, so the structure climbs one
// band at a time; the dome, hoops and crown are non-growable caps that appear
// whole on the final band.

import {
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";
import type { EconomicStructureLayout } from "./client-map-3d-structure-economic.js";

const HALF_PI = Math.PI / 2;
const MERIDIAN_ANGLES = [0, Math.PI / 3, (2 * Math.PI) / 3];

export const registerHydrogardenStructures = (
  builder: StructurePieceBuilder
): EconomicStructureLayout => {
  const C = builder.maxTiles;

  // ─── Materials ────────────────────────────────────────────────────────
  // Aged brass for the footing ring, armillary hoops and crown.
  const brassMaterial = new MeshStandardMaterial({ color: "#b08a3e", roughness: 0.42, metalness: 0.8, flatShading: true });
  // Translucent glass for the biodome. Transparent + depthWrite:false so the
  // green tiers and aether column stay readable through the dome.
  const glassMaterial = new MeshStandardMaterial({
    color: "#bfe9ff",
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  // Two green tones so the stacked crop tiers shade apart.
  const cropLowerMaterial = new MeshStandardMaterial({ color: "#4f9a2f", roughness: 0.85, metalness: 0, flatShading: true });
  const cropUpperMaterial = new MeshStandardMaterial({ color: "#6fbf3f", roughness: 0.85, metalness: 0, flatShading: true });
  // Bright cyan aether: the central growth column and its luminous tip.
  const aetherMaterial = new MeshStandardMaterial({ color: "#5ff2ff", roughness: 0.35, metalness: 0, flatShading: true, emissive: "#3df9ff", emissiveIntensity: 0.9 });
  const coreMaterial = new MeshStandardMaterial({ color: "#dfffff", roughness: 0.3, metalness: 0, flatShading: true, emissive: "#bffcff", emissiveIntensity: 1.3 });

  // ─── Geometries ───────────────────────────────────────────────────────
  const footingRingGeo = new TorusGeometry(0.30, 0.03, 8, 30);
  // Full sphere; its lower cap sinks below the surface (oy < radius) so only a
  // dome shows, and the bounding box stays centred for accurate measure().
  const orbGeo = new SphereGeometry(0.38, 28, 20);
  const hoopGeo = new TorusGeometry(0.385, 0.016, 6, 30);
  // Ground-based aether column: tall + growable, so it is the structure's
  // construction driver (its measured top equals its real top).
  const columnGeo = new CylinderGeometry(0.055, 0.045, 0.66, 12);
  // Unit-radius disc, scaled per tier; short (non-growing) so tiers appear whole.
  const tierGeo = new CylinderGeometry(1, 1, 0.035, 20);
  const crownGeo = new TorusGeometry(0.11, 0.018, 6, 20);
  const coreGeo = new SphereGeometry(0.05, 12, 10);

  // ─── Slots ────────────────────────────────────────────────────────────
  builder.makeSlot("hydroFooting", footingRingGeo, brassMaterial, C);
  builder.makeSlot("hydroOrb", orbGeo, glassMaterial, C);
  builder.makeSlot("hydroHoop", hoopGeo, brassMaterial, C * 3);
  builder.makeSlot("hydroColumn", columnGeo, aetherMaterial, C);
  builder.makeSlot("hydroTier", tierGeo, cropLowerMaterial, C * 2);
  builder.makeSlot("hydroTierTop", tierGeo, cropUpperMaterial, C);
  builder.makeSlot("hydroCrown", crownGeo, brassMaterial, C);
  builder.makeSlot("hydroCore", coreGeo, coreMaterial, C);

  // ─── Placement ────────────────────────────────────────────────────────
  const addHydrogarden: EconomicStructureLayout = (sx, sy, sz) => {
    // Brass footing ring at ground level; the dome seats into it.
    builder.addPiece("hydroFooting", sx, sy, sz, 0, 0.05, 0, 1, 1, 1, 0, HALF_PI, 0);
    // Glowing aether column rising from the ground through the dome crown.
    builder.addPiece("hydroColumn", sx, sy, sz, 0, 0.33, 0);
    // Three stacked hydroponic crop tiers, widest at the base.
    builder.addPiece("hydroTier", sx, sy, sz, 0, 0.14, 0, 0.30, 1, 0.30);
    builder.addPiece("hydroTier", sx, sy, sz, 0, 0.24, 0, 0.24, 1, 0.24);
    builder.addPiece("hydroTierTop", sx, sy, sz, 0, 0.34, 0, 0.18, 1, 0.18);
    // Three brass armillary hoops caging the translucent glass dome.
    for (const angle of MERIDIAN_ANGLES) {
      builder.addPiece("hydroHoop", sx, sy, sz, 0, 0.30, 0, 1, 1, 1, angle);
    }
    builder.addPiece("hydroOrb", sx, sy, sz, 0, 0.30, 0);
    builder.addPiece("hydroCrown", sx, sy, sz, 0, 0.62, 0, 1, 1, 1, 0, HALF_PI, 0);
    // Luminous tip at the top of the column.
    builder.addPiece("hydroCore", sx, sy, sz, 0, 0.70, 0);
  };

  return addHydrogarden;
};
