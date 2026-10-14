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
// dedicated overlay (client-map-3d-farmland/client-map-3d-farmland.ts,
// client-map-3d-fishing/client-map-3d-fishing.ts, client-map-3d-titanium-deposit.ts,
// client-map-3d-umbrite-deposit.ts) and are never routed here — only GEMS
// remains generic.
export type ResourceKind = "GEMS";
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
      furPostGeo, furBodyGeo,
      furTripodPostGeo, furTripodBindingGeo, furTripodPeltGeo,
      derrickLegGeo, derrickCapGeo, pumpBaseGeo, pumpArmGeo, pumpHeadGeo, oilPoolGeo
    ].forEach((g) => g.dispose());
    [
      veggieGreenMaterial, veggieRedMaterial,
      woodLogMaterial, woodHutMaterial, woodRoofMaterial, sawBladeMaterial,
      stoneMaterial, darkStoneMaterial, ironOreMaterial, chimneyMaterial,
      gemBlueMaterial,
      furBodyMaterial, furPostMaterial,
      oilDerrickMaterial, oilPumpMaterial, oilPoolMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
