import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Texture,
  Vector3
} from "three";
import { applyBuildingEnvMap } from "./client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { createResourceOverlayAssets } from "./client-map-3d-resource-overlay-assets.js";

// 3D resource overlay — remaining resource kinds × 3 variants each. Each
// variant is composed from a handful of shared primitive "pieces" (small
// boxes, cones, cylinders) so adjacent same-resource tiles read with
// visible variety like the forest module's pine/spruce variants. Variant
// is chosen deterministically per tile via a hash so a refresh paints the
// same arrangement. FARM, TITANIUM, and UMBRITE each have their own
// dedicated overlay (client-map-3d-barley-field.ts,
// client-map-3d-titanium-deposit.ts, client-map-3d-umbrite-deposit.ts) and
// are never routed here — only GEMS and FISH remain generic.
export type ResourceKind = "GEMS" | "FISH";
export type ResourceVariant = 0 | 1 | 2;

const variantHash = (worldX: number, worldZ: number, salt: number): ResourceVariant => {
  const h = ((worldX * 374761393) ^ (worldZ * 668265263) ^ (salt * 1442695041)) >>> 0;
  return (h % 3) as ResourceVariant;
};

export type ResourceOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    resource: ResourceKind,
    worldTileX: number,
    worldTileY: number
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createResourceOverlay = (scene: Scene, maxTiles: number, buildingEnvironmentTexture?: Texture): ResourceOverlay => {
  // Materials + geometries live in their own factory (client-map-3d-resource-overlay-assets.ts)
  // to keep this file under the 500-line cap.
  const {
    veggieGreenMaterial,
    veggieRedMaterial,
    woodLogMaterial,
    woodHutMaterial,
    woodRoofMaterial,
    sawBladeMaterial,
    stoneMaterial,
    darkStoneMaterial,
    ironOreMaterial,
    chimneyMaterial,
    gemBlueMaterial,
    boatHullMaterial,
    boatMastMaterial,
    fishingNetMaterial,
    fishMaterial,
    furBodyMaterial,
    furPostMaterial,
    oilDerrickMaterial,
    oilPumpMaterial,
    oilPoolMaterial,
    veggieGeo,
    logGeo,
    hutBaseGeo,
    hutRoofGeo,
    sawBladeGeo,
    stoneSmallGeo,
    stoneLargeGeo,
    ironOreGeo,
    mineArchGeo,
    mineHillGeo,
    chimneyGeo,
    gemCrystalGeo,
    boatHullGeo,
    boatMastGeo,
    boatSailGeo,
    netRodGeo,
    fishGeo,
    furPostGeo,
    furBodyGeo,
    furTripodPostGeo,
    furTripodBindingGeo,
    furTripodPeltGeo,
    derrickLegGeo,
    derrickCapGeo,
    pumpBaseGeo,
    pumpArmGeo,
    pumpHeadGeo,
    oilPoolGeo
  } = createResourceOverlayAssets();

  // ─── InstancedMesh registry ────────────────────────────────────────
  // Use a generic store keyed by name for compactness. Each entry holds
  // the mesh and its current instance count.
  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();

  const make = (key: string, geo: BoxGeometry | ConeGeometry | CylinderGeometry | IcosahedronGeometry, mat: MeshStandardMaterial, cap: number): Slot => {
    const mesh = new InstancedMesh(geo, mat, cap);
    applyBuildingEnvMap(mat, buildingEnvironmentTexture);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const slot: Slot = { mesh, count: 0, cap };
    slots.set(key, slot);
    return slot;
  };

  // Caps are conservative — most resources have low per-frame counts on
  // a single zoom level. maxTiles*N covers worst-case where every visible
  // tile is one resource type's variant with N pieces.
  const C = maxTiles;
  make("veggieGreen", veggieGeo, veggieGreenMaterial, C * 6);
  make("veggieRed", veggieGeo, veggieRedMaterial, C * 4);
  make("log", logGeo, woodLogMaterial, C * 6);
  make("hutBase", hutBaseGeo, woodHutMaterial, C * 2);
  make("hutRoof", hutRoofGeo, woodRoofMaterial, C * 2);
  make("sawBlade", sawBladeGeo, sawBladeMaterial, C);
  make("stoneSmall", stoneSmallGeo, stoneMaterial, C * 5);
  make("stoneLarge", stoneLargeGeo, stoneMaterial, C * 2);
  make("ironOre", ironOreGeo, ironOreMaterial, C * 5);
  make("mineArch", mineArchGeo, darkStoneMaterial, C);
  make("mineHill", mineHillGeo, stoneMaterial, C);
  make("chimney", chimneyGeo, chimneyMaterial, C);
  // Single InstancedMesh, per-instance scale gives crystal rank.
  make("gemCrystalBlue", gemCrystalGeo, gemBlueMaterial, C * 12);
  make("boatHull", boatHullGeo, boatHullMaterial, C);
  make("boatMast", boatMastGeo, boatMastMaterial, C);
  make("boatSail", boatSailGeo, boatMastMaterial, C);
  make("netRod", netRodGeo, fishingNetMaterial, C * 4);
  make("fish", fishGeo, fishMaterial, C * 6);
  make("furPost", furPostGeo, furPostMaterial, C * 12);
  make("furBody", furBodyGeo, furBodyMaterial, C * 8);
  // Tripod slots — variant 2 can place up to 3 tripods per tile.
  make("furTripodPost", furTripodPostGeo, furPostMaterial, C * 9);
  make("furTripodBinding", furTripodBindingGeo, furPostMaterial, C * 3);
  make("furTripodPelt", furTripodPeltGeo, furBodyMaterial, C * 3);
  make("derrickLeg", derrickLegGeo, oilDerrickMaterial, C * 4);
  make("derrickCap", derrickCapGeo, oilDerrickMaterial, C);
  make("pumpBase", pumpBaseGeo, oilPumpMaterial, C);
  make("pumpArm", pumpArmGeo, oilPumpMaterial, C);
  make("pumpHead", pumpHeadGeo, oilPumpMaterial, C);
  make("oilPool", oilPoolGeo, oilPoolMaterial, C);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  const addPiece = (
    key: string,
    worldX: number,
    surfaceY: number,
    worldZ: number,
    ox: number,
    oy: number,
    oz: number,
    scaleX = 1,
    scaleY = 1,
    scaleZ = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(worldX + ox, surfaceY + oy, worldZ + oz);
    scale.set(scaleX, scaleY, scaleZ);
    if (rotX === 0 && rotY === 0 && rotZ === 0) {
      matrix.compose(position, identityQuat, scale);
    } else {
      tmpEuler.set(rotX, rotY, rotZ, "XYZ");
      tmpQuat.setFromEuler(tmpEuler);
      matrix.compose(position, tmpQuat, scale);
    }
    slot.mesh.setMatrixAt(slot.count, matrix);
    slot.count += 1;
  };

  // ─── Variants ───────────────────────────────────────────────────────

  const addLogPile = (wx: number, sy: number, wz: number, ox: number, oz: number): void => {
    addPiece("log", wx, sy, wz, ox - 0.06, 0.05, oz, 1, 1, 1, 0, 0, Math.PI * 0.5);
    addPiece("log", wx, sy, wz, ox + 0.06, 0.05, oz, 1, 1, 1, 0, 0, Math.PI * 0.5);
    addPiece("log", wx, sy, wz, ox, 0.13, oz, 1, 1, 1, 0, 0, Math.PI * 0.5);
  };

  const addWood = (wx: number, sy: number, wz: number, v: ResourceVariant): void => {
    // Logger camp = hut + log pile + sawmill blade. Same pieces, three layouts.
    if (v === 0) {
      // Hut left, log pile center, sawmill blade right
      addPiece("hutBase", wx, sy, wz, -0.26, 0.08, 0);
      addPiece("hutRoof", wx, sy, wz, -0.26, 0.22, 0, 1, 1, 1, Math.PI * 0.25);
      addLogPile(wx, sy, wz, 0, 0);
      addPiece("sawBlade", wx, sy, wz, 0.26, 0.1, 0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    } else if (v === 1) {
      // Hut back-center, log pile front-left, sawmill blade front-right
      addPiece("hutBase", wx, sy, wz, 0, 0.08, -0.18);
      addPiece("hutRoof", wx, sy, wz, 0, 0.22, -0.18, 1, 1, 1, Math.PI * 0.25);
      addLogPile(wx, sy, wz, -0.2, 0.18);
      addPiece("sawBlade", wx, sy, wz, 0.2, 0.1, 0.18, 1, 1, 1, 0, Math.PI * 0.5, 0);
    } else {
      // Hut front-right, log pile back-left, sawmill blade middle
      addPiece("hutBase", wx, sy, wz, 0.22, 0.08, 0.16);
      addPiece("hutRoof", wx, sy, wz, 0.22, 0.22, 0.16, 1, 1, 1, Math.PI * 0.25);
      addLogPile(wx, sy, wz, -0.2, -0.16);
      addPiece("sawBlade", wx, sy, wz, -0.04, 0.1, 0.0, 1, 1, 1, 0, Math.PI * 0.5, 0);
    }
  };

  // Compact ore pile: 5 nuggets in a tight pyramidal stack so the pile
  // reads small but visible.
  const addOrePile = (wx: number, sy: number, wz: number, ox: number, oz: number): void => {
    addPiece("ironOre", wx, sy, wz, ox - 0.06, 0.045, oz - 0.04);
    addPiece("ironOre", wx, sy, wz, ox + 0.04, 0.045, oz - 0.05);
    addPiece("ironOre", wx, sy, wz, ox - 0.02, 0.045, oz + 0.05);
    addPiece("ironOre", wx, sy, wz, ox + 0.02, 0.10, oz);
    addPiece("ironOre", wx, sy, wz, ox, 0.155, oz - 0.01);
  };

  const addIron = (wx: number, sy: number, wz: number, v: ResourceVariant): void => {
    // Iron site = ore stockpiles only. The smelter/forge return when
    // the player upgrades the tile with a mine structure.
    if (v === 0) {
      addOrePile(wx, sy, wz, -0.16, -0.14);
      addOrePile(wx, sy, wz, 0.16, 0.14);
      addPiece("ironOre", wx, sy, wz, 0.0, 0.045, 0.0);
      addPiece("ironOre", wx, sy, wz, 0.16, 0.045, -0.16);
    } else if (v === 1) {
      addOrePile(wx, sy, wz, 0.16, -0.14);
      addOrePile(wx, sy, wz, -0.16, 0.16);
      addPiece("ironOre", wx, sy, wz, 0.0, 0.045, 0.0);
      addPiece("ironOre", wx, sy, wz, -0.18, 0.045, -0.16);
    } else {
      addOrePile(wx, sy, wz, 0, -0.18);
      addOrePile(wx, sy, wz, 0.18, 0.16);
      addOrePile(wx, sy, wz, -0.18, 0.16);
    }
  };

  // Place an octahedron crystal with anisotropic Y-scale (tall/spike) and
  // a small forward tilt so it reads like the SVG's leaning gems. The
  // crystal is partially embedded so the bottom point is buried.
  const addCrystal = (
    wx: number,
    sy: number,
    wz: number,
    ox: number,
    oz: number,
    height: number,
    width = 1,
    leanDir = 0
  ): void => {
    // OctahedronGeometry(0.06) has half-height 0.06, so unit Y-scale = 0.12 tall.
    // We want the bottom point ~0.04 below ground, so center sits at:
    //   surfaceY + (height/2) - 0.04
    const yScale = height / 0.12;
    const xzScale = width;
    const centerY = (height * 0.5) - 0.04;
    // Lean angle: tilt around the (cosθ, 0, sinθ) horizontal axis where θ is leanDir.
    const tiltAmount = Math.PI * 0.06;
    const tiltX = Math.sin(leanDir) * tiltAmount;
    const tiltZ = Math.cos(leanDir) * tiltAmount;
    addPiece("gemCrystalBlue", wx, sy, wz, ox, centerY, oz, xzScale, yScale, xzScale, 0, tiltX, tiltZ);
  };

  const addGems = (wx: number, sy: number, wz: number, v: ResourceVariant): void => {
    // SVG-matched gem cluster: 11 blue crystals only (no rubble, no
    // purple), of varying heights, one dominant hero, fan radiating
    // outward, each slightly tilted away from the cluster center so the
    // spikes splay like petals.
    const cx = v === 0 ? 0 : v === 1 ? 0.06 : -0.06;
    const cz = v === 0 ? -0.02 : v === 1 ? -0.08 : 0.08;
    const seed = v;

    addCrystal(wx, sy, wz, cx, cz - 0.02, 0.55, 1.4, Math.PI * 0.5);

    addCrystal(wx, sy, wz, cx - 0.12, cz + 0.04, 0.38, 1.0, Math.PI * (0.2 + seed * 0.05));
    addCrystal(wx, sy, wz, cx + 0.12, cz + 0.02, 0.36, 1.0, -Math.PI * (0.2 + seed * 0.05));
    addCrystal(wx, sy, wz, cx + 0.04, cz + 0.14, 0.34, 0.95, Math.PI * 0.0);
    addCrystal(wx, sy, wz, cx - 0.06, cz + 0.16, 0.32, 0.95, Math.PI * 0.05);

    addCrystal(wx, sy, wz, cx - 0.20, cz - 0.04, 0.24, 0.88, Math.PI * 0.4);
    addCrystal(wx, sy, wz, cx + 0.20, cz - 0.06, 0.26, 0.88, -Math.PI * 0.4);
    addCrystal(wx, sy, wz, cx + 0.16, cz + 0.18, 0.22, 0.85, -Math.PI * 0.1);

    addCrystal(wx, sy, wz, cx - 0.24, cz + 0.10, 0.18, 0.78, Math.PI * 0.3);
    addCrystal(wx, sy, wz, cx - 0.04, cz - 0.18, 0.16, 0.78, Math.PI * 0.7);
    addCrystal(wx, sy, wz, cx + 0.24, cz + 0.10, 0.16, 0.78, -Math.PI * 0.3);
  };

  const addFishingBoat = (wx: number, sy: number, wz: number, ox: number, oz: number): void => {
    addPiece("boatHull", wx, sy, wz, ox, 0.04, oz);
    addPiece("boatMast", wx, sy, wz, ox - 0.02, 0.16, oz);
    addPiece("boatSail", wx, sy, wz, ox + 0.04, 0.18, oz);
  };

  const addDryingRack = (wx: number, sy: number, wz: number, ox: number, oz: number): void => {
    // Two posts + horizontal rod, with fish hanging vertically below
    // the rod (rotated 90° around Z so the long edge runs along Y, and
    // positioned so the top of the fish meets the rod). Slight forward
    // tilt so they read as dangling rather than sitting on the bar.
    const rodY = 0.22;
    const fishHangY = rodY - 0.04; // top of fish at rod, center 0.04 below
    addPiece("furPost", wx, sy, wz, ox - 0.13, 0.11, oz);
    addPiece("furPost", wx, sy, wz, ox + 0.13, 0.11, oz);
    addPiece("netRod", wx, sy, wz, ox, rodY, oz, 1, 1, 1, 0, 0, Math.PI * 0.5);
    // Fish geometry default is 0.07 long (X) × 0.025 tall (Y) × 0.03 deep (Z).
    // Rotating around Z by 90° aligns the 0.07 axis with Y → fish hangs
    // head-up / tail-down. A small forward pitch (rotX) gives a natural
    // dangling lean.
    const hangSpacing = 0.08;
    for (let i = -1; i <= 1; i += 1) {
      addPiece("fish", wx, sy, wz, ox + i * hangSpacing, fishHangY, oz, 1, 1, 1, 0, Math.PI * 0.08, Math.PI * 0.5);
    }
  };

  const addFish = (wx: number, sy: number, wz: number, v: ResourceVariant): void => {
    // Fishing site = boat + drying rack only. The X-crossed nets that
    // used to read as a tall cross are gone; the rack already implies
    // fishing equipment.
    if (v === 0) {
      addFishingBoat(wx, sy, wz, -0.16, 0);
      addDryingRack(wx, sy, wz, 0.14, -0.18);
    } else if (v === 1) {
      addFishingBoat(wx, sy, wz, 0.16, -0.16);
      addDryingRack(wx, sy, wz, -0.14, 0.18);
    } else {
      addFishingBoat(wx, sy, wz, 0, 0.18);
      addDryingRack(wx, sy, wz, -0.16, -0.16);
    }
  };

  // Tripod geometry shared by every fur tripod: 3 thicker posts lean to
  // a common apex (apex at y = TRIPOD_APEX_Y above the centre), base
  // radius TRIPOD_BASE_R around the centre. Tilt = atan(R / APEX). Per-
  // post (rotY, rotZ) precomputed once. furTripodPostGeo is length 0.30,
  // matching the base-to-apex distance ≈ sqrt(R² + APEX²) ≈ 0.30 with
  // R = 0.18 / 2 and APEX = 0.26 so the posts meet cleanly at the top
  // without overhang.
  const TRIPOD_BASE_R = 0.09;
  const TRIPOD_APEX_Y = 0.26;
  const TRIPOD_TILT = Math.atan(TRIPOD_BASE_R / TRIPOD_APEX_Y);
  type TripodLeg = {
    readonly cx: number;
    readonly cy: number;
    readonly cz: number;
    readonly rotY: number;
    readonly rotZ: number;
  };
  const TRIPOD_LEGS: ReadonlyArray<TripodLeg> = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((alpha) => {
    // Base on the ground in a triangle; centre of the cylinder sits at
    // the midpoint of base→apex. Yaw of the lean direction (apex - base)
    // in the XZ plane is atan2(-sin α, -cos α); we feed −yaw into rotY
    // because Three.js's Euler XYZ applies Rz first then Ry to a vector.
    const baseX = Math.cos(alpha) * TRIPOD_BASE_R;
    const baseZ = Math.sin(alpha) * TRIPOD_BASE_R;
    const yaw = Math.atan2(-Math.sin(alpha), -Math.cos(alpha));
    return {
      cx: baseX / 2,
      cy: TRIPOD_APEX_Y / 2,
      cz: baseZ / 2,
      rotY: -yaw,
      rotZ: -TRIPOD_TILT
    };
  });

  const addFurTripod = (wx: number, sy: number, wz: number, ox: number, oz: number, rotY = 0): void => {
    // Three sticks leaning together at the apex to form a tepee/tripod,
    // with a single hide stretched across the front. Matches the 2D
    // fur-overlay sketch. `rotY` rotates the whole tripod around its
    // centre so adjacent tripods read as different orientations.
    const yawCos = Math.cos(rotY);
    const yawSin = Math.sin(rotY);
    const rotateXZ = (dx: number, dz: number): [number, number] => [
      yawCos * dx - yawSin * dz,
      yawSin * dx + yawCos * dz
    ];

    for (const leg of TRIPOD_LEGS) {
      const [lx, lz] = rotateXZ(leg.cx, leg.cz);
      addPiece("furTripodPost", wx, sy, wz, ox + lx, leg.cy, oz + lz, 1, 1, 1, leg.rotY + rotY, 0, leg.rotZ);
    }

    // Dark binding at the apex — a small wrap suggesting the rope or
    // sinew that holds the three sticks together. Sits just below the
    // exact apex so it reads as the meeting point, not floating above.
    addPiece("furTripodBinding", wx, sy, wz, ox, TRIPOD_APEX_Y - 0.015, oz, 1, 1, 1, rotY);

    // Stretched pelt hanging on the front face of the tripod. Wider and
    // taller than the legacy furBody, with a forward tilt so its broad
    // surface faces a perspective camera looking at the front. Position
    // it so the pelt's top edge is just below the apex binding and its
    // bottom edge nearly reaches the ground — the classic "hide
    // stretched between leaning poles" silhouette from the 2D overlay.
    const peltLocalZ = 0.075;
    const [px, pz] = rotateXZ(0, peltLocalZ);
    addPiece(
      "furTripodPelt",
      wx, sy, wz,
      ox + px, 0.115, oz + pz,
      1, 1, 1,
      rotY, Math.PI * 0.08, 0
    );
  };

  const addFur = (wx: number, sy: number, wz: number, v: ResourceVariant): void => {
    // Fur site = a couple of tripods only. The trapper hut / hunter
    // camp come back as upgrade structures later; for the raw resource
    // tile we keep just the tripods so the visual reads cleanly.
    if (v === 0) {
      addFurTripod(wx, sy, wz, -0.18, -0.14, 0);
      addFurTripod(wx, sy, wz, 0.18, 0.14, Math.PI * 0.5);
    } else if (v === 1) {
      addFurTripod(wx, sy, wz, 0.18, -0.14, Math.PI * 0.25);
      addFurTripod(wx, sy, wz, -0.18, 0.16, -Math.PI * 0.25);
    } else {
      addFurTripod(wx, sy, wz, -0.18, 0.0, 0);
      addFurTripod(wx, sy, wz, 0.18, 0.0, 0);
      addFurTripod(wx, sy, wz, 0.0, -0.18, Math.PI * 0.5);
    }
  };

  const addDerrick = (wx: number, sy: number, wz: number, ox: number, oz: number, scale = 1): void => {
    const legHalf = 0.1 * scale;
    const legTilt = Math.PI * 0.13;
    addPiece("derrickLeg", wx, sy, wz, ox - legHalf, 0.17 * scale, oz - legHalf, scale, scale, scale, 0, 0, legTilt);
    addPiece("derrickLeg", wx, sy, wz, ox + legHalf, 0.17 * scale, oz - legHalf, scale, scale, scale, 0, 0, -legTilt);
    addPiece("derrickLeg", wx, sy, wz, ox - legHalf, 0.17 * scale, oz + legHalf, scale, scale, scale, legTilt, 0, legTilt);
    addPiece("derrickLeg", wx, sy, wz, ox + legHalf, 0.17 * scale, oz + legHalf, scale, scale, scale, legTilt, 0, -legTilt);
    addPiece("derrickCap", wx, sy, wz, ox, 0.34 * scale, oz, scale, scale, scale);
  };

  const addPumpJack = (wx: number, sy: number, wz: number, ox: number, oz: number): void => {
    addPiece("pumpBase", wx, sy, wz, ox, 0.04, oz);
    addPiece("pumpArm", wx, sy, wz, ox, 0.13, oz);
    addPiece("pumpHead", wx, sy, wz, ox + 0.10, 0.085, oz);
  };

  const addOil = (wx: number, sy: number, wz: number, v: ResourceVariant): void => {
    // Oil site = derrick + pump jack + oil pool in three layouts.
    if (v === 0) {
      addDerrick(wx, sy, wz, -0.20, -0.14, 0.85);
      addPumpJack(wx, sy, wz, 0.10, 0);
      addPiece("oilPool", wx, sy, wz, -0.16, 0.013, 0.18);
    } else if (v === 1) {
      addDerrick(wx, sy, wz, 0.18, 0.16, 0.85);
      addPumpJack(wx, sy, wz, -0.16, 0);
      addPiece("oilPool", wx, sy, wz, 0.16, 0.013, -0.16);
    } else {
      addDerrick(wx, sy, wz, 0, 0.18, 0.85);
      addPumpJack(wx, sy, wz, 0.16, -0.18);
      addPiece("oilPool", wx, sy, wz, -0.18, 0.013, -0.14);
    }
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    resource: ResourceKind,
    worldTileX: number,
    worldTileY: number
  ): void => {
    // Variant is deterministic per world tile so panning the camera
    // doesn't reshuffle a tile's layout. Scene coords are used only for
    // placement.
    const v = variantHash(worldTileX, worldTileY, resource.length * 31);
    if (resource === "GEMS") addGems(sceneX, surfaceY, sceneZ, v);
    else if (resource === "FISH") addFish(sceneX, surfaceY, sceneZ, v);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.clearUpdateRanges();
      slot.mesh.instanceMatrix.addUpdateRange(0, slot.mesh.count * 16);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [
      veggieGeo, logGeo, hutBaseGeo, hutRoofGeo, sawBladeGeo,
      stoneSmallGeo, stoneLargeGeo, ironOreGeo, mineArchGeo, mineHillGeo, chimneyGeo,
      gemCrystalGeo,
      boatHullGeo, boatMastGeo, boatSailGeo, netRodGeo, fishGeo,
      furPostGeo, furBodyGeo,
      furTripodPostGeo, furTripodBindingGeo, furTripodPeltGeo,
      derrickLegGeo, derrickCapGeo, pumpBaseGeo, pumpArmGeo, pumpHeadGeo, oilPoolGeo
    ].forEach((g) => g.dispose());
    [
      veggieGreenMaterial, veggieRedMaterial,
      woodLogMaterial, woodHutMaterial, woodRoofMaterial, sawBladeMaterial,
      stoneMaterial, darkStoneMaterial, ironOreMaterial, chimneyMaterial,
      gemBlueMaterial,
      boatHullMaterial, boatMastMaterial, fishingNetMaterial, fishMaterial,
      furBodyMaterial, furPostMaterial,
      oilDerrickMaterial, oilPumpMaterial, oilPoolMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
