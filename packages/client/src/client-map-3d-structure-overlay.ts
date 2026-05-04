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
  Vector3
} from "three";

// 3D economic-structure overlay (Tier 1): FARMSTEAD, WATERWORKS, CAMP,
// MINE, IRONWORKS. Each structure is a small composition of primitive
// pieces — one design per type (no per-tile variants), so adjacent
// same-type structures look identical, mirroring the 2D SVG overlays.
//
// Status states (active / under_construction / inactive / removing) are
// not yet differentiated in 3D; for now every state renders fully — we
// can iterate later by adding per-instance alpha or pulse on smoke.

export type StructureKind = "FARMSTEAD" | "WATERWORKS" | "CAMP" | "MINE" | "IRONWORKS";

export const STRUCTURE_KINDS_HANDLED_BY_3D: ReadonlySet<StructureKind> = new Set([
  "FARMSTEAD",
  "WATERWORKS",
  "CAMP",
  "MINE",
  "IRONWORKS"
]);

export type StructureOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, kind: StructureKind) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createStructureOverlay = (scene: Scene, maxTiles: number): StructureOverlay => {
  // ─── Materials ──────────────────────────────────────────────────────
  const barnRedMaterial = new MeshStandardMaterial({ color: "#a0432e", roughness: 0.88, metalness: 0, flatShading: true });
  const barnRoofMaterial = new MeshStandardMaterial({ color: "#3a261c", roughness: 0.92, metalness: 0, flatShading: true });
  const siloMaterial = new MeshStandardMaterial({ color: "#c8b890", roughness: 0.86, metalness: 0, flatShading: true });
  const woodFenceMaterial = new MeshStandardMaterial({ color: "#5e4530", roughness: 0.92, metalness: 0, flatShading: true });
  const stoneMaterial = new MeshStandardMaterial({ color: "#8a857a", roughness: 0.92, metalness: 0, flatShading: true });
  const stoneRoofMaterial = new MeshStandardMaterial({ color: "#5d574e", roughness: 0.88, metalness: 0, flatShading: true });
  const waterWheelMaterial = new MeshStandardMaterial({ color: "#6a4a32", roughness: 0.88, metalness: 0, flatShading: true });
  const waterMaterial = new MeshStandardMaterial({ color: "#3a8eb8", roughness: 0.32, metalness: 0.18, flatShading: true });
  const tentCanvasMaterial = new MeshStandardMaterial({ color: "#a89673", roughness: 0.88, metalness: 0, flatShading: true });
  const fireMaterial = new MeshStandardMaterial({
    color: "#e8843a",
    roughness: 0.4,
    metalness: 0,
    flatShading: true,
    emissive: "#ff4818",
    emissiveIntensity: 0.55
  });
  const drymeatRackMaterial = new MeshStandardMaterial({ color: "#5a3e2a", roughness: 0.9, metalness: 0, flatShading: true });
  const drymeatPeltMaterial = new MeshStandardMaterial({ color: "#9b6a3e", roughness: 0.92, metalness: 0, flatShading: true });
  const mineHillMaterial = new MeshStandardMaterial({ color: "#7a7268", roughness: 0.95, metalness: 0, flatShading: true });
  const mineDarkMaterial = new MeshStandardMaterial({ color: "#1c1c20", roughness: 0.95, metalness: 0, flatShading: true });
  const mineBeamMaterial = new MeshStandardMaterial({ color: "#5a4530", roughness: 0.9, metalness: 0, flatShading: true });
  const mineCartMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.7, metalness: 0.25, flatShading: true });
  const mineCartWheelMaterial = new MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.6, metalness: 0.3, flatShading: true });
  const oreMaterial = new MeshStandardMaterial({ color: "#6a6a72", roughness: 0.85, metalness: 0.15, flatShading: true });
  const forgeBaseMaterial = new MeshStandardMaterial({ color: "#5d4d3d", roughness: 0.92, metalness: 0, flatShading: true });
  const forgeStoneMaterial = new MeshStandardMaterial({ color: "#6a625a", roughness: 0.92, metalness: 0, flatShading: true });
  const forgeChimneyMaterial = new MeshStandardMaterial({ color: "#3a302a", roughness: 0.94, metalness: 0, flatShading: true });
  const forgeGlowMaterial = new MeshStandardMaterial({
    color: "#ff7a2a",
    roughness: 0.4,
    metalness: 0,
    flatShading: true,
    emissive: "#ff5318",
    emissiveIntensity: 0.7
  });
  const anvilMaterial = new MeshStandardMaterial({ color: "#262628", roughness: 0.6, metalness: 0.4, flatShading: true });

  // ─── Geometries ─────────────────────────────────────────────────────
  // Farmstead barn
  const barnBodyGeo = new BoxGeometry(0.32, 0.22, 0.22);
  const barnRoofGeo = new ConeGeometry(0.22, 0.14, 4);
  const siloBodyGeo = new CylinderGeometry(0.07, 0.07, 0.28, 10);
  const siloCapGeo = new ConeGeometry(0.075, 0.07, 10);
  const fenceGeo = new BoxGeometry(0.018, 0.06, 0.16);
  // Waterworks
  const wwTowerGeo = new BoxGeometry(0.22, 0.32, 0.22);
  const wwRoofGeo = new ConeGeometry(0.18, 0.12, 4);
  const wwWheelGeo = new CylinderGeometry(0.13, 0.13, 0.05, 12);
  const wwTroughGeo = new BoxGeometry(0.42, 0.04, 0.06);
  // Camp
  const tentGeo = new ConeGeometry(0.13, 0.20, 4);
  const fireGeo = new ConeGeometry(0.05, 0.10, 5);
  const dryRackPostGeo = new CylinderGeometry(0.018, 0.022, 0.22, 5);
  const dryRackBarGeo = new CylinderGeometry(0.014, 0.014, 0.32, 5);
  const dryRackPeltGeo = new BoxGeometry(0.13, 0.085, 0.018);
  // Mine
  const mineHillGeo = new ConeGeometry(0.30, 0.22, 6);
  const mineEntranceGeo = new BoxGeometry(0.18, 0.16, 0.05);
  const mineBeamGeo = new BoxGeometry(0.20, 0.022, 0.022);
  const mineSupportGeo = new BoxGeometry(0.022, 0.16, 0.022);
  const mineCartGeo = new BoxGeometry(0.13, 0.07, 0.10);
  const mineCartWheelGeo = new CylinderGeometry(0.025, 0.025, 0.022, 8);
  const oreGeo = new IcosahedronGeometry(0.04, 0);
  // Ironworks
  const forgeBaseGeo = new BoxGeometry(0.32, 0.18, 0.24);
  const forgeRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const forgeStoneFurnaceGeo = new BoxGeometry(0.16, 0.20, 0.16);
  const forgeChimneyGeo = new BoxGeometry(0.07, 0.30, 0.07);
  const forgeGlowGeo = new BoxGeometry(0.06, 0.06, 0.06);
  const anvilTopGeo = new BoxGeometry(0.10, 0.025, 0.05);
  const anvilBaseGeo = new BoxGeometry(0.07, 0.05, 0.05);

  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();
  const make = (
    key: string,
    geo: BoxGeometry | ConeGeometry | CylinderGeometry | IcosahedronGeometry,
    mat: MeshStandardMaterial,
    cap: number
  ): void => {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    slots.set(key, { mesh, count: 0, cap });
  };

  const C = maxTiles;
  // Farmstead pieces
  make("barnBody", barnBodyGeo, barnRedMaterial, C);
  make("barnRoof", barnRoofGeo, barnRoofMaterial, C);
  make("siloBody", siloBodyGeo, siloMaterial, C);
  make("siloCap", siloCapGeo, siloMaterial, C);
  make("fence", fenceGeo, woodFenceMaterial, C * 4);
  // Waterworks
  make("wwTower", wwTowerGeo, stoneMaterial, C);
  make("wwRoof", wwRoofGeo, stoneRoofMaterial, C);
  make("wwWheel", wwWheelGeo, waterWheelMaterial, C);
  make("wwTrough", wwTroughGeo, waterMaterial, C);
  // Camp
  make("tent", tentGeo, tentCanvasMaterial, C * 2);
  make("fire", fireGeo, fireMaterial, C);
  make("dryRackPost", dryRackPostGeo, drymeatRackMaterial, C * 2);
  make("dryRackBar", dryRackBarGeo, drymeatRackMaterial, C);
  make("dryRackPelt", dryRackPeltGeo, drymeatPeltMaterial, C * 2);
  // Mine
  make("mineHill", mineHillGeo, mineHillMaterial, C);
  make("mineEntrance", mineEntranceGeo, mineDarkMaterial, C);
  make("mineBeam", mineBeamGeo, mineBeamMaterial, C);
  make("mineSupport", mineSupportGeo, mineBeamMaterial, C * 2);
  make("mineCart", mineCartGeo, mineCartMaterial, C);
  make("mineCartWheel", mineCartWheelGeo, mineCartWheelMaterial, C * 2);
  make("ore", oreGeo, oreMaterial, C * 3);
  // Ironworks
  make("forgeBase", forgeBaseGeo, forgeBaseMaterial, C);
  make("forgeRoof", forgeRoofGeo, barnRoofMaterial, C);
  make("forgeFurnace", forgeStoneFurnaceGeo, forgeStoneMaterial, C);
  make("forgeChimney", forgeChimneyGeo, forgeChimneyMaterial, C);
  make("forgeGlow", forgeGlowGeo, forgeGlowMaterial, C);
  make("anvilTop", anvilTopGeo, anvilMaterial, C);
  make("anvilBase", anvilBaseGeo, anvilMaterial, C);

  // ─── Helpers ────────────────────────────────────────────────────────
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identityQuat = new Quaternion();
  const tmpEuler = new Euler();
  const tmpQuat = new Quaternion();

  const addPiece = (
    key: string,
    sceneX: number,
    surfaceY: number,
    sceneZ: number,
    ox: number,
    oy: number,
    oz: number,
    sx = 1,
    sy_scale = 1,
    sz = 1,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): void => {
    const slot = slots.get(key);
    if (!slot || slot.count >= slot.cap) return;
    position.set(sceneX + ox, surfaceY + oy, sceneZ + oz);
    scale.set(sx, sy_scale, sz);
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

  // ─── Per-structure layouts ──────────────────────────────────────────

  const addFarmstead = (sx: number, sy: number, sz: number): void => {
    // Red barn front-left, silo front-right, low fence around the back.
    addPiece("barnBody", sx, sy, sz, -0.10, 0.11, 0.04);
    addPiece("barnRoof", sx, sy, sz, -0.10, 0.29, 0.04, 1, 1, 1, Math.PI * 0.25);
    addPiece("siloBody", sx, sy, sz, 0.16, 0.14, 0.04);
    addPiece("siloCap", sx, sy, sz, 0.16, 0.32, 0.04);
    // Fence segments at the back edge of the tile (4 short rails).
    addPiece("fence", sx, sy, sz, -0.18, 0.03, -0.18);
    addPiece("fence", sx, sy, sz, -0.02, 0.03, -0.18);
    addPiece("fence", sx, sy, sz, 0.14, 0.03, -0.18);
    addPiece("fence", sx, sy, sz, 0.30, 0.03, -0.18);
  };

  const addWaterworks = (sx: number, sy: number, sz: number): void => {
    // Stone tower with a vertical-axis water wheel on its side, trough
    // running along the front. Wheel cylinder is rotated so its flat
    // faces point left-right (default Y-axis → Z-axis).
    addPiece("wwTower", sx, sy, sz, -0.06, 0.16, 0);
    addPiece("wwRoof", sx, sy, sz, -0.06, 0.38, 0, 1, 1, 1, Math.PI * 0.25);
    addPiece("wwWheel", sx, sy, sz, 0.16, 0.14, 0, 1, 1, 1, 0, 0, Math.PI * 0.5);
    addPiece("wwTrough", sx, sy, sz, 0, 0.04, 0.18);
  };

  const addCamp = (sx: number, sy: number, sz: number): void => {
    // 2 tents + central fire + a small drying rack at the back.
    addPiece("tent", sx, sy, sz, -0.18, 0.10, 0.10);
    addPiece("tent", sx, sy, sz, 0.16, 0.10, 0.14, 1, 1, 1, Math.PI * 0.3);
    addPiece("fire", sx, sy, sz, -0.02, 0.05, 0.04);
    // Drying rack at the back: 2 posts + 1 horizontal bar + 2 pelts.
    addPiece("dryRackPost", sx, sy, sz, -0.18, 0.11, -0.20);
    addPiece("dryRackPost", sx, sy, sz, 0.18, 0.11, -0.20);
    addPiece("dryRackBar", sx, sy, sz, 0, 0.22, -0.20, 1, 1, 1, 0, 0, Math.PI * 0.5);
    addPiece("dryRackPelt", sx, sy, sz, -0.10, 0.16, -0.20);
    addPiece("dryRackPelt", sx, sy, sz, 0.10, 0.16, -0.20);
  };

  const addMine = (sx: number, sy: number, sz: number): void => {
    // Hill with dark archway + supporting beams, plus a mine cart with
    // ore loaded out front.
    addPiece("mineHill", sx, sy, sz, 0, 0.11, -0.10);
    addPiece("mineEntrance", sx, sy, sz, 0, 0.08, 0.04);
    // Wooden A-frame around the entrance: 2 vertical supports + 1 lintel.
    addPiece("mineSupport", sx, sy, sz, -0.10, 0.08, 0.02);
    addPiece("mineSupport", sx, sy, sz, 0.10, 0.08, 0.02);
    addPiece("mineBeam", sx, sy, sz, 0, 0.165, 0.02);
    // Mine cart out in front, on rails (suggested by 2 wheels).
    addPiece("mineCart", sx, sy, sz, 0.14, 0.07, 0.22);
    addPiece("mineCartWheel", sx, sy, sz, 0.08, 0.04, 0.22, 1, 1, 1, 0, 0, Math.PI * 0.5);
    addPiece("mineCartWheel", sx, sy, sz, 0.20, 0.04, 0.22, 1, 1, 1, 0, 0, Math.PI * 0.5);
    addPiece("ore", sx, sy, sz, 0.10, 0.10, 0.22);
    addPiece("ore", sx, sy, sz, 0.16, 0.10, 0.22);
    addPiece("ore", sx, sy, sz, 0.13, 0.13, 0.22);
  };

  const addIronworks = (sx: number, sy: number, sz: number): void => {
    // Forge hut with stone furnace, tall chimney, and an anvil out front.
    addPiece("forgeBase", sx, sy, sz, -0.08, 0.09, -0.04);
    addPiece("forgeRoof", sx, sy, sz, -0.08, 0.23, -0.04, 1, 1, 1, Math.PI * 0.25);
    addPiece("forgeFurnace", sx, sy, sz, 0.18, 0.10, -0.04);
    addPiece("forgeGlow", sx, sy, sz, 0.18, 0.07, 0.05);
    addPiece("forgeChimney", sx, sy, sz, 0.22, 0.27, -0.04);
    // Anvil: pyramidal silhouette in front.
    addPiece("anvilBase", sx, sy, sz, -0.04, 0.025, 0.20);
    addPiece("anvilTop", sx, sy, sz, -0.04, 0.065, 0.20);
  };

  // ─── Public API ─────────────────────────────────────────────────────
  const clear = (): void => {
    for (const slot of slots.values()) slot.count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, kind: StructureKind): void => {
    if (kind === "FARMSTEAD") addFarmstead(sceneX, surfaceY, sceneZ);
    else if (kind === "WATERWORKS") addWaterworks(sceneX, surfaceY, sceneZ);
    else if (kind === "CAMP") addCamp(sceneX, surfaceY, sceneZ);
    else if (kind === "MINE") addMine(sceneX, surfaceY, sceneZ);
    else if (kind === "IRONWORKS") addIronworks(sceneX, surfaceY, sceneZ);
  };

  const commit = (): void => {
    for (const slot of slots.values()) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots.values()) scene.remove(slot.mesh);
    [
      barnBodyGeo, barnRoofGeo, siloBodyGeo, siloCapGeo, fenceGeo,
      wwTowerGeo, wwRoofGeo, wwWheelGeo, wwTroughGeo,
      tentGeo, fireGeo, dryRackPostGeo, dryRackBarGeo, dryRackPeltGeo,
      mineHillGeo, mineEntranceGeo, mineBeamGeo, mineSupportGeo, mineCartGeo, mineCartWheelGeo, oreGeo,
      forgeBaseGeo, forgeRoofGeo, forgeStoneFurnaceGeo, forgeChimneyGeo, forgeGlowGeo, anvilTopGeo, anvilBaseGeo
    ].forEach((g) => g.dispose());
    [
      barnRedMaterial, barnRoofMaterial, siloMaterial, woodFenceMaterial,
      stoneMaterial, stoneRoofMaterial, waterWheelMaterial, waterMaterial,
      tentCanvasMaterial, fireMaterial, drymeatRackMaterial, drymeatPeltMaterial,
      mineHillMaterial, mineDarkMaterial, mineBeamMaterial, mineCartMaterial, mineCartWheelMaterial, oreMaterial,
      forgeBaseMaterial, forgeStoneMaterial, forgeChimneyMaterial, forgeGlowMaterial, anvilMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
