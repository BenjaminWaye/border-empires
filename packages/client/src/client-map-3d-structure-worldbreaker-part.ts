import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

// The Worldbreaker Cannon's 3 unique components — WORLD_ENGINE_PART_1
// (Long Barrel), WORLD_ENGINE_PART_2 (Fracture Core), WORLD_ENGINE_PART_3
// (Sky-Marking Array) — are real, distinct wire types (see the unique-
// monument-components rewrite), so each maps directly to its own model;
// no client-side variant-picking is needed any more.
export type WorldbreakerPartStructureKind =
  | "WORLD_ENGINE_PART_1"
  | "WORLD_ENGINE_PART_2"
  | "WORLD_ENGINE_PART_3";

export const WORLDBREAKER_PART_STRUCTURE_KINDS: ReadonlySet<WorldbreakerPartStructureKind> = new Set([
  "WORLD_ENGINE_PART_1",
  "WORLD_ENGINE_PART_2",
  "WORLD_ENGINE_PART_3"
]);

export type WorldbreakerPartStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number
) => void;

export type WorldbreakerPartHandle = {
  readonly layouts: Record<WorldbreakerPartStructureKind, WorldbreakerPartStructureLayout>;
};

export const registerWorldbreakerPartStructures = (
  builder: StructurePieceBuilder
): WorldbreakerPartHandle => {
  const C = builder.maxTiles;

  // ─── Part palette ───────────────────────────────────────────────────
  // The Worldbreaker Cannon reads as monumental imperial ordnance:
  // soot-dark gunmetal iron, aged/weathered brass reinforcement, and
  // stone-grey mechanical supports. Each part carries exactly one small
  // focal emissive accent — the barrel's primed muzzle ring, the
  // restrained core crystal, or the array's targeting lens. The crystal
  // uses a deep, dull orange-red rather than a hot saturated orange so
  // it reads as dangerous industrial energy instead of magic.
  const wbIronMaterial = new MeshStandardMaterial({ color: "#2a241e", roughness: 0.82, metalness: 0.3, flatShading: true });
  const wbIronDarkMaterial = new MeshStandardMaterial({ color: "#1f1b16", roughness: 0.85, metalness: 0.35, flatShading: true });
  const wbStoneMaterial = new MeshStandardMaterial({ color: "#8a8078", roughness: 0.88, metalness: 0, flatShading: true });
  const wbStoneDarkMaterial = new MeshStandardMaterial({ color: "#6e6459", roughness: 0.9, metalness: 0, flatShading: true });
  const wbBrassMaterial = new MeshStandardMaterial({ color: "#9e7130", roughness: 0.55, metalness: 0.55, flatShading: true });
  const wbBrassDarkMaterial = new MeshStandardMaterial({ color: "#6e521f", roughness: 0.6, metalness: 0.5, flatShading: true });
  const wbCharcoalMaterial = new MeshStandardMaterial({ color: "#34302b", roughness: 0.85, metalness: 0.4, flatShading: true });
  const wbEmberMaterial = new MeshStandardMaterial({ color: "#c85a3a", roughness: 0.45, metalness: 0.2, flatShading: true, emissive: "#8a1a0a", emissiveIntensity: 0.55 });
  const wbCrystalMaterial = new MeshStandardMaterial({ color: "#b8452a", roughness: 0.3, metalness: 0.1, flatShading: true, emissive: "#9c1f0a", emissiveIntensity: 0.7 });
  const wbAmberMaterial = new MeshStandardMaterial({ color: "#d8983a", roughness: 0.4, metalness: 0.3, flatShading: true, emissive: "#a86a10", emissiveIntensity: 0.55 });

  // ─── Geometries ─────────────────────────────────────────────────────
  // Long Barrel
  const lbBaseGeo = new BoxGeometry(0.52, 0.07, 0.36);
  const lbBreechChockGeo = new BoxGeometry(0.16, 0.08, 0.12);
  const lbMuzzleChockGeo = new BoxGeometry(0.16, 0.14, 0.12);
  const lbBracketGeo = new BoxGeometry(0.14, 0.14, 0.055);
  const lbRivetGeo = new BoxGeometry(0.022, 0.022, 0.022);
  const lbBarrelGeo = new CylinderGeometry(0.05, 0.088, 0.62, 10);
  const lbBreechGeo = new CylinderGeometry(0.1, 0.115, 0.11, 10);
  const lbBandMuzzleGeo = new CylinderGeometry(0.076, 0.076, 0.018, 10);
  const lbBandRearGeo = new CylinderGeometry(0.088, 0.088, 0.022, 10);
  const lbMuzzleRingGeo = new CylinderGeometry(0.078, 0.078, 0.02, 12);
  // Fracture Core
  const fcBasePlateGeo = new CylinderGeometry(0.225, 0.225, 0.025, 8);
  const fcBaseGeo = new CylinderGeometry(0.19, 0.21, 0.09, 8);
  const fcCollarGeo = new CylinderGeometry(0.175, 0.185, 0.07, 8);
  const fcStrutGeo = new BoxGeometry(0.035, 0.2, 0.035);
  const fcClampGeo = new BoxGeometry(0.05, 0.16, 0.05);
  const fcStudGeo = new BoxGeometry(0.04, 0.04, 0.04);
  const fcCrystalMainGeo = new OctahedronGeometry(0.11, 0);
  const fcCrystalShardGeo = new OctahedronGeometry(0.05, 0);
  // Sky-Marking Array
  const saBasePlateGeo = new CylinderGeometry(0.185, 0.19, 0.025, 10);
  const saBaseGeo = new CylinderGeometry(0.15, 0.16, 0.03, 10);
  const saLegGeo = new CylinderGeometry(0.017, 0.022, 0.36, 6);
  const saJointGeo = new BoxGeometry(0.06, 0.06, 0.06);
  const saHubGeo = new CylinderGeometry(0.04, 0.05, 0.08, 8);
  const saLensGeo = new OctahedronGeometry(0.05, 0);
  const saLensTipGeo = new OctahedronGeometry(0.028, 0);

  builder.makeSlot("lbBase", lbBaseGeo, wbStoneMaterial, C);
  builder.makeSlot("lbBreechChock", lbBreechChockGeo, wbStoneDarkMaterial, C);
  builder.makeSlot("lbMuzzleChock", lbMuzzleChockGeo, wbStoneDarkMaterial, C);
  builder.makeSlot("lbBracket", lbBracketGeo, wbBrassMaterial, C * 2);
  builder.makeSlot("lbRivet", lbRivetGeo, wbBrassMaterial, C * 4);
  builder.makeSlot("lbBarrel", lbBarrelGeo, wbIronMaterial, C);
  builder.makeSlot("lbBreech", lbBreechGeo, wbIronDarkMaterial, C);
  builder.makeSlot("lbBandMuzzle", lbBandMuzzleGeo, wbBrassMaterial, C);
  builder.makeSlot("lbBandRear", lbBandRearGeo, wbBrassMaterial, C);
  builder.makeSlot("lbMuzzleRing", lbMuzzleRingGeo, wbEmberMaterial, C);
  builder.makeSlot("fcBasePlate", fcBasePlateGeo, wbCharcoalMaterial, C);
  builder.makeSlot("fcBase", fcBaseGeo, wbIronMaterial, C);
  builder.makeSlot("fcCollar", fcCollarGeo, wbIronMaterial, C);
  builder.makeSlot("fcStrut", fcStrutGeo, wbIronDarkMaterial, C * 4);
  builder.makeSlot("fcClamp", fcClampGeo, wbIronDarkMaterial, C * 6);
  builder.makeSlot("fcStud", fcStudGeo, wbCharcoalMaterial, C * 4);
  builder.makeSlot("fcCrystalMain", fcCrystalMainGeo, wbCrystalMaterial, C);
  builder.makeSlot("fcCrystalShard", fcCrystalShardGeo, wbCrystalMaterial, C * 2);
  builder.makeSlot("saBasePlate", saBasePlateGeo, wbStoneDarkMaterial, C);
  builder.makeSlot("saBase", saBaseGeo, wbStoneMaterial, C);
  builder.makeSlot("saLeg", saLegGeo, wbBrassMaterial, C * 3);
  builder.makeSlot("saJoint", saJointGeo, wbIronMaterial, C * 3);
  builder.makeSlot("saHub", saHubGeo, wbIronDarkMaterial, C);
  builder.makeSlot("saLens", saLensGeo, wbAmberMaterial, C);
  builder.makeSlot("saLensTip", saLensTipGeo, wbAmberMaterial, C);

  const addLongBarrel: WorldbreakerPartStructureLayout = (sx, sy, sz) => {
    // A long tapered iron barrel resting diagonally in a heavy mechanical
    // cradle, muzzle lifted and primed. The whole barrel assembly shares
    // one rotation — euler (rotX=-0.10, rotY=PI/4, rotZ=PI/2) — which lays
    // the Y-axis cylinder along a diagonal with the muzzle end raised. The
    // piece offsets below are precomputed along that axis unit vector
    // (-0.7071, 0.0706, 0.7036) so every barrel part stays coaxial.
    // Stone-grey base plate, two end chocks, two chunky brass cradle
    // brackets with rivets, then the tapered barrel wrapped in brass
    // reinforcement bands, a heavy reinforced breech block, and the small
    // dull ember-orange muzzle ring — the single focal accent.
    builder.addPiece("lbBase", sx, sy, sz, 0, 0.035, 0, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("lbBreechChock", sx, sy, sz, 0.12, 0.045, -0.12, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("lbMuzzleChock", sx, sy, sz, -0.12, 0.075, 0.12, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("lbBracket", sx, sy, sz, 0.074, 0.04, 0.074, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("lbBracket", sx, sy, sz, -0.074, 0.04, -0.074, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("lbRivet", sx, sy, sz, 0.102, 0.045, 0.102);
    builder.addPiece("lbRivet", sx, sy, sz, 0.102, 0.075, 0.102);
    builder.addPiece("lbRivet", sx, sy, sz, -0.102, 0.045, -0.102);
    builder.addPiece("lbRivet", sx, sy, sz, -0.102, 0.075, -0.102);
    builder.addPiece("lbBarrel", sx, sy, sz, 0, 0.16, 0, 1, 1, 1, Math.PI * 0.25, -0.1, Math.PI * 0.5);
    builder.addPiece("lbBreech", sx, sy, sz, 0.057, 0.154, -0.057, 1, 1, 1, Math.PI * 0.25, -0.1, Math.PI * 0.5);
    builder.addPiece("lbBandRear", sx, sy, sz, 0.127, 0.147, -0.127, 1, 1, 1, Math.PI * 0.25, -0.1, Math.PI * 0.5);
    builder.addPiece("lbBandMuzzle", sx, sy, sz, -0.127, 0.173, 0.127, 1, 1, 1, Math.PI * 0.25, -0.1, Math.PI * 0.5);
    builder.addPiece("lbMuzzleRing", sx, sy, sz, -0.198, 0.18, 0.197, 1, 1, 1, Math.PI * 0.25, -0.1, Math.PI * 0.5);
  };

  const addFractureCore: WorldbreakerPartStructureLayout = (sx, sy, sz) => {
    // A faceted crystal core clamped inside a heavy iron containment rig.
    // A charcoal base plate carries the octagonal iron base and upper
    // collar, four corner struts rise beside the core, and six chunky
    // clamp blocks grip the crystal mid-body leaving small gaps between
    // ring and core. The deep orange-red emissive crystal — main shard
    // plus two smaller tumbled shards — is the only bright element, and
    // its glow is what shows through the gaps: a catastrophically
    // powerful energy source held in place.
    builder.addPiece("fcBasePlate", sx, sy, sz, 0, 0.0125, 0);
    builder.addPiece("fcBase", sx, sy, sz, 0, 0.045, 0);
    builder.addPiece("fcCollar", sx, sy, sz, 0, 0.125, 0);
    const strutOffsets: ReadonlyArray<readonly [number, number]> = [
      [0.165, 0], [0, 0.165], [-0.165, 0], [0, -0.165]
    ];
    for (const [ox, oz] of strutOffsets) {
      builder.addPiece("fcStrut", sx, sy, sz, ox, 0.16, oz);
    }
    for (let k = 0; k < 6; k += 1) {
      const a = (k * Math.PI) / 3;
      builder.addPiece("fcClamp", sx, sy, sz, Math.cos(a) * 0.142, 0.22, Math.sin(a) * 0.142, 1, 1, 1, a);
    }
    const studOffsets: ReadonlyArray<readonly [number, number]> = [
      [0.185, 0], [0, 0.185], [-0.185, 0], [0, -0.185]
    ];
    for (const [ox, oz] of studOffsets) {
      builder.addPiece("fcStud", sx, sy, sz, ox, 0.095, oz);
    }
    builder.addPiece("fcCrystalMain", sx, sy, sz, 0, 0.24, 0);
    builder.addPiece("fcCrystalShard", sx, sy, sz, 0.055, 0.315, 0.02, 1, 1, 1, Math.PI * 0.25);
    builder.addPiece("fcCrystalShard", sx, sy, sz, -0.045, 0.28, -0.05, 0.8, 0.8, 0.8, Math.PI * 0.125);
  };

  const addSkyMarkingArray: WorldbreakerPartStructureLayout = (sx, sy, sz) => {
    // A compact tripod targeting instrument aimed at the sky. Three thin
    // brass struts converge on a point above the base, each rotated
    // (rotY + rotZ, see comments) so its own top end reaches the apex; a
    // dark-iron joint cube marks each strut midpoint, and the small
    // faceted amber lens crowns the apex as the single focal accent.
    // Leg midpoints were derived from base radius 0.17 and apex height
    // 0.30 at 120-degree spacing.
    const legs: ReadonlyArray<readonly [number, number, number, number]> = [
      [0, 0.15, -0.085, -Math.PI * 0.5],
      [-0.0736, 0.15, 0.0425, 2.618],
      [0.0736, 0.15, 0.0425, Math.PI / 6]
    ];
    for (const [mx, my, mz, rotY] of legs) {
      builder.addPiece("saLeg", sx, sy, sz, mx, my, mz, 1, 1, 1, rotY, 0, 0.5155);
      builder.addPiece("saJoint", sx, sy, sz, mx, my, mz);
    }
    builder.addPiece("saBasePlate", sx, sy, sz, 0, 0.0125, 0);
    builder.addPiece("saBase", sx, sy, sz, 0, 0.015, 0);
    builder.addPiece("saHub", sx, sy, sz, 0, 0.29, 0);
    builder.addPiece("saLens", sx, sy, sz, 0, 0.34, 0);
    builder.addPiece("saLensTip", sx, sy, sz, 0, 0.375, 0);
  };

  return {
    layouts: {
      WORLD_ENGINE_PART_1: addLongBarrel,
      WORLD_ENGINE_PART_2: addFractureCore,
      WORLD_ENGINE_PART_3: addSkyMarkingArray
    }
  };
};
