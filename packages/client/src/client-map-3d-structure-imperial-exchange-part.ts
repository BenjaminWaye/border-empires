import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

// The Imperial Exchange is built from three parts, each placed on a
// support tile (one per Great City). The wire protocol only carries a
// single type string ("IMPERIAL_EXCHANGE_PART") for every part tile, so
// this family registers the wire kind plus three client-only variant
// kinds — one per part asset — and resolves which variant a tile shows
// deterministically from its coordinates. The wire kind renders the
// Golden Ledger (the default "part" read).
export type ImperialExchangePartStructureKind =
  | "IMPERIAL_EXCHANGE_PART"
  | "IMPERIAL_EXCHANGE_PART_LEDGER"
  | "IMPERIAL_EXCHANGE_PART_ENGINE"
  | "IMPERIAL_EXCHANGE_PART_SEAL";

export const IMPERIAL_EXCHANGE_PART_STRUCTURE_KINDS: ReadonlySet<ImperialExchangePartStructureKind> = new Set([
  "IMPERIAL_EXCHANGE_PART",
  "IMPERIAL_EXCHANGE_PART_LEDGER",
  "IMPERIAL_EXCHANGE_PART_ENGINE",
  "IMPERIAL_EXCHANGE_PART_SEAL"
]);

export const IMPERIAL_EXCHANGE_PART_VARIANTS: ReadonlyArray<ImperialExchangePartStructureKind> = [
  "IMPERIAL_EXCHANGE_PART_LEDGER",
  "IMPERIAL_EXCHANGE_PART_ENGINE",
  "IMPERIAL_EXCHANGE_PART_SEAL"
];

// Stable, coordinate-based variant pick so the three parts of one
// monument settle on distinct assets without any wire changes. The
// double-mod keeps the index positive for negative world coords.
export const imperialExchangePartVariantForTile = (
  wx: number,
  wy: number
): ImperialExchangePartStructureKind => {
  const idx = ((wx * 7 + wy * 13) % IMPERIAL_EXCHANGE_PART_VARIANTS.length + IMPERIAL_EXCHANGE_PART_VARIANTS.length) % IMPERIAL_EXCHANGE_PART_VARIANTS.length;
  return IMPERIAL_EXCHANGE_PART_VARIANTS[idx]!;
};

export type ImperialExchangePartStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number
) => void;

export type ImperialExchangePartHandle = {
  readonly layouts: Record<ImperialExchangePartStructureKind, ImperialExchangePartStructureLayout>;
};

export const registerImperialExchangePartStructures = (
  builder: StructurePieceBuilder
): ImperialExchangePartHandle => {
  const C = builder.maxTiles;

  // ─── Part palette ───────────────────────────────────────────────────
  // The Imperial Exchange reads as a treasury of bureaucratic wealth:
  // soot-dark iron, warm grey stone, aged/tarnished brass (deliberately
  // duller than the manpower branch's brighter brass), muted parchment,
  // and one small dull-gold glow per asset — the ledger's seal and the
  // seal's crest. The Counting Engine breaks the rule with a single
  // cyan processing-ring instead (its only emissive accent).
  const ixIronMaterial = new MeshStandardMaterial({ color: "#2a241e", roughness: 0.82, metalness: 0.3, flatShading: true });
  const ixStoneMaterial = new MeshStandardMaterial({ color: "#8a8078", roughness: 0.88, metalness: 0, flatShading: true });
  const ixStoneDarkMaterial = new MeshStandardMaterial({ color: "#6e6459", roughness: 0.9, metalness: 0, flatShading: true });
  const ixBrassMaterial = new MeshStandardMaterial({ color: "#9e7130", roughness: 0.55, metalness: 0.55, flatShading: true });
  const ixBrassDarkMaterial = new MeshStandardMaterial({ color: "#6e521f", roughness: 0.6, metalness: 0.5, flatShading: true });
  const ixParchmentMaterial = new MeshStandardMaterial({ color: "#cfc6a8", roughness: 0.92, metalness: 0.05, flatShading: true });
  const ixGoldMaterial = new MeshStandardMaterial({ color: "#c99a3f", roughness: 0.45, metalness: 0.35, flatShading: true, emissive: "#8a6512", emissiveIntensity: 0.55 });
  const ixCyanMaterial = new MeshStandardMaterial({ color: "#5fc9d9", roughness: 0.35, metalness: 0.1, flatShading: true, emissive: "#1f8aa0", emissiveIntensity: 0.7 });

  // ─── Geometries ─────────────────────────────────────────────────────
  // Ledger
  const lgCradleGeo = new BoxGeometry(0.26, 0.035, 0.17);
  const lgBodyGeo = new BoxGeometry(0.20, 0.34, 0.15);
  const lgBandGeo = new BoxGeometry(0.21, 0.02, 0.16);
  const lgCornerGeo = new BoxGeometry(0.035, 0.035, 0.012);
  const lgSealGeo = new CylinderGeometry(0.03, 0.03, 0.012, 8);
  const lgPageGeo = new BoxGeometry(0.18, 0.015, 0.13);
  // Counting engine
  const ceBaseGeo = new CylinderGeometry(0.15, 0.165, 0.035, 12);
  const ceDrumGeo = new CylinderGeometry(0.125, 0.13, 0.15, 16);
  const ceBandGeo = new CylinderGeometry(0.132, 0.132, 0.012, 16);
  const ceDrumTopGeo = new CylinderGeometry(0.125, 0.125, 0.02, 16);
  const ceStudGeo = new CylinderGeometry(0.012, 0.012, 0.02, 6);
  const ceSideHousingGeo = new BoxGeometry(0.05, 0.06, 0.09);
  const ceSideAxleGeo = new CylinderGeometry(0.01, 0.01, 0.035, 6);
  const ceHousingGeo = new BoxGeometry(0.16, 0.075, 0.03);
  const ceWheelGeo = new CylinderGeometry(0.022, 0.022, 0.014, 10);
  const ceRingGeo = new CylinderGeometry(0.028, 0.028, 0.008, 10);
  const ceAxleGeo = new CylinderGeometry(0.008, 0.008, 0.01, 6);
  // Sovereign seal
  const ssBaseGeo = new CylinderGeometry(0.17, 0.19, 0.05, 14);
  const ssPlinthGeo = new CylinderGeometry(0.15, 0.16, 0.045, 14);
  const ssBodyGeo = new CylinderGeometry(0.13, 0.145, 0.10, 14);
  const ssWaistGeo = new CylinderGeometry(0.15, 0.15, 0.022, 14);
  const ssDiscGeo = new CylinderGeometry(0.16, 0.16, 0.045, 16);
  const ssRimGeo = new CylinderGeometry(0.164, 0.164, 0.012, 16);
  const ssCrestRingGeo = new CylinderGeometry(0.045, 0.045, 0.008, 12);
  const ssRayGeo = new BoxGeometry(0.05, 0.006, 0.008);
  const ssGoldGeo = new OctahedronGeometry(0.016, 0);

  builder.makeSlot("lgCradle", lgCradleGeo, ixBrassDarkMaterial, C);
  builder.makeSlot("lgBody", lgBodyGeo, ixIronMaterial, C);
  builder.makeSlot("lgBand", lgBandGeo, ixBrassMaterial, C * 2);
  builder.makeSlot("lgCorner", lgCornerGeo, ixBrassMaterial, C * 4);
  builder.makeSlot("lgSeal", lgSealGeo, ixGoldMaterial, C);
  builder.makeSlot("lgPage", lgPageGeo, ixParchmentMaterial, C * 4);
  builder.makeSlot("ceBase", ceBaseGeo, ixStoneDarkMaterial, C);
  builder.makeSlot("ceDrum", ceDrumGeo, ixBrassMaterial, C);
  builder.makeSlot("ceBand", ceBandGeo, ixIronMaterial, C);
  builder.makeSlot("ceDrumTop", ceDrumTopGeo, ixIronMaterial, C);
  builder.makeSlot("ceStud", ceStudGeo, ixBrassMaterial, C);
  builder.makeSlot("ceSideHousing", ceSideHousingGeo, ixIronMaterial, C * 2);
  builder.makeSlot("ceSideAxle", ceSideAxleGeo, ixBrassDarkMaterial, C * 2);
  builder.makeSlot("ceHousing", ceHousingGeo, ixBrassDarkMaterial, C);
  builder.makeSlot("ceWheel", ceWheelGeo, ixBrassMaterial, C * 4);
  builder.makeSlot("ceRing", ceRingGeo, ixCyanMaterial, C);
  builder.makeSlot("ceAxle", ceAxleGeo, ixIronMaterial, C * 4);
  builder.makeSlot("ssBase", ssBaseGeo, ixStoneDarkMaterial, C);
  builder.makeSlot("ssPlinth", ssPlinthGeo, ixIronMaterial, C);
  builder.makeSlot("ssBody", ssBodyGeo, ixStoneMaterial, C);
  builder.makeSlot("ssWaist", ssWaistGeo, ixBrassMaterial, C);
  builder.makeSlot("ssDisc", ssDiscGeo, ixIronMaterial, C);
  builder.makeSlot("ssRim", ssRimGeo, ixBrassMaterial, C);
  builder.makeSlot("ssCrestRing", ssCrestRingGeo, ixBrassDarkMaterial, C);
  builder.makeSlot("ssRay", ssRayGeo, ixBrassMaterial, C * 8);
  builder.makeSlot("ssGold", ssGoldGeo, ixGoldMaterial, C);

  // Stand the ledger upright on its spine with the cover facing the
  // viewer (+Z). Slightly exaggerated height so the book reads at a
  // glance as an imperial financial record rather than an ordinary one.
  const addGoldenLedger: ImperialExchangePartStructureLayout = (sx, sy, sz) => {
    // Heavy brass cradle at the base, iron cover block, brass binding
    // bands top and bottom with corner plates, then a fanned stack of
    // parchment pages poking above the top band. The single focal
    // accent is the faceted dull-gold seal pressed into the cover.
    builder.addPiece("lgCradle", sx, sy, sz, 0, 0.0175, 0);
    builder.addPiece("lgBody", sx, sy, sz, 0, 0.205, 0);
    builder.addPiece("lgBand", sx, sy, sz, 0, 0.045, 0);
    builder.addPiece("lgBand", sx, sy, sz, 0, 0.365, 0);
    builder.addPiece("lgCorner", sx, sy, sz, 0.0825, 0.0525, 0.081);
    builder.addPiece("lgCorner", sx, sy, sz, -0.0825, 0.0525, 0.081);
    builder.addPiece("lgCorner", sx, sy, sz, 0.0825, 0.3575, 0.081);
    builder.addPiece("lgCorner", sx, sy, sz, -0.0825, 0.3575, 0.081);
    builder.addPiece("lgSeal", sx, sy, sz, 0, 0.205, 0.081, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("lgPage", sx, sy, sz, 0, 0.3825, 0, 1, 1, 1, 0, Math.PI * 0.05, 0);
    builder.addPiece("lgPage", sx, sy, sz, 0, 0.399, 0, 0.94, 1, 0.92, 0, Math.PI * -0.05, 0);
    builder.addPiece("lgPage", sx, sy, sz, 0, 0.4155, 0, 0.88, 1, 0.85, 0, Math.PI * 0.05, 0);
    builder.addPiece("lgPage", sx, sy, sz, 0, 0.432, 0, 0.83, 1, 0.77, 0, Math.PI * -0.04, 0);
  };

  const addCountingEngine: ImperialExchangePartStructureLayout = (sx, sy, sz) => {
    // Squat mechanical drum: a tapered brass body on a stone base, iron
    // band and top plate, side bearing housings with exposed axles, and
    // a front tally panel holding four separated brass tally wheels.
    // The middle wheel carries the single emissive accent — a thin
    // glowing cyan ring around its rim, "actively processing".
    builder.addPiece("ceBase", sx, sy, sz, 0, 0.0175, 0);
    builder.addPiece("ceDrum", sx, sy, sz, 0, 0.11, 0);
    builder.addPiece("ceBand", sx, sy, sz, 0, 0.08, 0);
    builder.addPiece("ceDrumTop", sx, sy, sz, 0, 0.195, 0);
    builder.addPiece("ceStud", sx, sy, sz, 0, 0.215, 0);
    builder.addPiece("ceSideHousing", sx, sy, sz, 0.15, 0.11, 0);
    builder.addPiece("ceSideHousing", sx, sy, sz, -0.15, 0.11, 0);
    builder.addPiece("ceSideAxle", sx, sy, sz, 0.15, 0.135, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("ceSideAxle", sx, sy, sz, -0.15, 0.135, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    builder.addPiece("ceHousing", sx, sy, sz, 0, 0.11, 0.14);
    builder.addPiece("ceWheel", sx, sy, sz, -0.045, 0.11, 0.162, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceWheel", sx, sy, sz, -0.015, 0.11, 0.162, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceWheel", sx, sy, sz, 0.015, 0.11, 0.162, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceWheel", sx, sy, sz, 0.045, 0.11, 0.162, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceRing", sx, sy, sz, -0.015, 0.11, 0.169, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceAxle", sx, sy, sz, -0.045, 0.11, 0.177, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceAxle", sx, sy, sz, -0.015, 0.11, 0.177, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceAxle", sx, sy, sz, 0.015, 0.11, 0.177, 1, 1, 1, 0, Math.PI * 0.5, 0);
    builder.addPiece("ceAxle", sx, sy, sz, 0.045, 0.11, 0.177, 1, 1, 1, 0, Math.PI * 0.5, 0);
  };

  const addSovereignSeal: ImperialExchangePartStructureLayout = (sx, sy, sz) => {
    // Massive ceremonial stamp: a stepped stone-and-iron pedestal,
    // brass waist ring, then a wide iron seal disc with a brass rim.
    // Engraved on the disc face is a simple sunburst crest — eight
    // brass rays fanning from a dark brass medallion — with a small
    // faceted dull-gold octahedron at the crest center as the sole
    // focal accent.
    builder.addPiece("ssBase", sx, sy, sz, 0, 0.025, 0);
    builder.addPiece("ssPlinth", sx, sy, sz, 0, 0.0725, 0);
    builder.addPiece("ssBody", sx, sy, sz, 0, 0.145, 0);
    builder.addPiece("ssWaist", sx, sy, sz, 0, 0.206, 0);
    builder.addPiece("ssDisc", sx, sy, sz, 0, 0.2395, 0);
    builder.addPiece("ssRim", sx, sy, sz, 0, 0.256, 0);
    builder.addPiece("ssCrestRing", sx, sy, sz, 0, 0.266, 0);
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      builder.addPiece("ssRay", sx, sy, sz, Math.cos(a) * 0.10, 0.265, Math.sin(a) * 0.10, 1, 1, 1, a, 0, 0);
    }
    builder.addPiece("ssGold", sx, sy, sz, 0, 0.272, 0);
  };

  return {
    layouts: {
      IMPERIAL_EXCHANGE_PART: addGoldenLedger,
      IMPERIAL_EXCHANGE_PART_LEDGER: addGoldenLedger,
      IMPERIAL_EXCHANGE_PART_ENGINE: addCountingEngine,
      IMPERIAL_EXCHANGE_PART_SEAL: addSovereignSeal
    }
  };
};
