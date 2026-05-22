import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3
} from "three";

// Resource hint passed through `addInstance` so the MINE mesh can swap
// its cart load between iron ore and blue crystals depending on what's
// under the structure. Keep this loose — other kinds ignore it.
export type StructureResourceHint = "IRON" | "GEMS" | undefined;

// 3D economic-structure overlay (Tier 1): FARMSTEAD, WATERWORKS, CAMP,
// MINE, IRONWORKS, MARKET, OBSERVATORY, GRANARY, SEED_GRANARY. Each
// structure is a small composition of primitive pieces — one design per
// type (no per-tile variants), so adjacent same-type structures look
// identical, mirroring the 2D SVG overlays.
//
// Status states (active / under_construction / inactive / removing) are
// not yet differentiated in 3D; for now every state renders fully — we
// can iterate later by adding per-instance alpha or pulse on smoke.
//
// OBSERVATORY is wired via `tile.observatory` (not `economicStructure`)
// — the orchestrator side calls addInstance with kind="OBSERVATORY"
// whenever the tile carries an observatory record.

export type StructureKind =
  | "FARMSTEAD"
  | "WATERWORKS"
  | "CAMP"
  | "MINE"
  | "IRONWORKS"
  | "MARKET"
  | "OBSERVATORY"
  | "GRANARY"
  | "SEED_GRANARY"
  | "BANK"
  | "AETHER_TOWER"
  | "AEGIS_DOME"
  | "WORLD_ENGINE"
  | "IMPERIAL_EXCHANGE";

export const STRUCTURE_KINDS_HANDLED_BY_3D: ReadonlySet<StructureKind> = new Set([
  "FARMSTEAD",
  "WATERWORKS",
  "CAMP",
  "MINE",
  "IRONWORKS",
  "MARKET",
  "OBSERVATORY",
  "GRANARY",
  "SEED_GRANARY",
  "BANK",
  "AETHER_TOWER",
  "AEGIS_DOME",
  "WORLD_ENGINE",
  "IMPERIAL_EXCHANGE"
]);

export type StructureOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    kind: StructureKind,
    resource?: StructureResourceHint
  ) => void;
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
  // Market: striped awning + counter + crates.
  const marketCounterMaterial = new MeshStandardMaterial({ color: "#7a5a38", roughness: 0.9, metalness: 0, flatShading: true });
  const marketAwningRedMaterial = new MeshStandardMaterial({ color: "#c53b2c", roughness: 0.86, metalness: 0, flatShading: true });
  const marketAwningWhiteMaterial = new MeshStandardMaterial({ color: "#eadcc2", roughness: 0.86, metalness: 0, flatShading: true });
  const marketPostMaterial = new MeshStandardMaterial({ color: "#5a4530", roughness: 0.9, metalness: 0, flatShading: true });
  const marketCrateMaterial = new MeshStandardMaterial({ color: "#9a6b3a", roughness: 0.88, metalness: 0, flatShading: true });
  const marketProduceMaterial = new MeshStandardMaterial({ color: "#d97f2a", roughness: 0.78, metalness: 0, flatShading: true });
  // Observatory: stone drum + bluish dome + dark slit + brass telescope.
  const observatoryStoneMaterial = new MeshStandardMaterial({ color: "#9a948a", roughness: 0.92, metalness: 0, flatShading: true });
  const observatoryDomeMaterial = new MeshStandardMaterial({ color: "#4a5a72", roughness: 0.55, metalness: 0.35, flatShading: true });
  const observatorySlitMaterial = new MeshStandardMaterial({ color: "#1a1a20", roughness: 0.95, metalness: 0, flatShading: true });
  const observatoryTelescopeMaterial = new MeshStandardMaterial({ color: "#8a6a3a", roughness: 0.5, metalness: 0.55, flatShading: true });
  // Blue crystal: shared by the observatory dome and the mine's cart
  // load when it sits on a GEMS tile. Emissive so it reads as "powered".
  const blueCrystalMaterial = new MeshStandardMaterial({
    color: "#5fa7e6",
    roughness: 0.35,
    metalness: 0.2,
    flatShading: true,
    emissive: "#2a6fae",
    emissiveIntensity: 0.55
  });
  // Granary: wooden barn with cream slatted walls, golden gable roof,
  // grey-roofed side annex, and a small white cupola — colors drawn from
  // granary-overlay.svg so 2D ↔ 3D read as the same structure.
  const granaryWallMaterial = new MeshStandardMaterial({ color: "#dccaa8", roughness: 0.9, metalness: 0, flatShading: true });
  const granaryRoofMaterial = new MeshStandardMaterial({ color: "#d7a64a", roughness: 0.85, metalness: 0, flatShading: true });
  const granaryAnnexRoofMaterial = new MeshStandardMaterial({ color: "#9a9388", roughness: 0.9, metalness: 0, flatShading: true });
  const granaryBandMaterial = new MeshStandardMaterial({ color: "#a77836", roughness: 0.88, metalness: 0, flatShading: true });
  const granaryCupolaMaterial = new MeshStandardMaterial({ color: "#e3d7c6", roughness: 0.9, metalness: 0, flatShading: true });
  const granarySackMaterial = new MeshStandardMaterial({ color: "#b58541", roughness: 0.92, metalness: 0, flatShading: true });
  // Seed granary: cluster of stone silos with copper conical caps + a
  // small seed-lab annex with a green-glowing window — reads as advanced
  // agronomy, completely distinct from the wooden barn granary.
  const seedSiloMaterial = new MeshStandardMaterial({ color: "#cfc4ac", roughness: 0.88, metalness: 0, flatShading: true });
  const seedSiloBandMaterial = new MeshStandardMaterial({ color: "#8a7e6a", roughness: 0.92, metalness: 0, flatShading: true });
  const seedSiloCapMaterial = new MeshStandardMaterial({ color: "#b0683a", roughness: 0.55, metalness: 0.5, flatShading: true });
  const seedLabWallMaterial = new MeshStandardMaterial({ color: "#7a6a52", roughness: 0.9, metalness: 0, flatShading: true });
  const seedLabRoofMaterial = new MeshStandardMaterial({ color: "#3a2e26", roughness: 0.92, metalness: 0, flatShading: true });
  const seedLabGlowMaterial = new MeshStandardMaterial({
    color: "#7ad26a",
    roughness: 0.4,
    metalness: 0,
    flatShading: true,
    emissive: "#3aa648",
    emissiveIntensity: 0.6
  });
  // Bank: cream stone facade with a white pyramidal roof, two front
  // columns and a small stack of gold coins on the front step. Reads as
  // a small civic/financial building distinct from the market stall.
  const bankWallMaterial = new MeshStandardMaterial({ color: "#cabb98", roughness: 0.9, metalness: 0, flatShading: true });
  const bankTrimMaterial = new MeshStandardMaterial({ color: "#ece2cf", roughness: 0.88, metalness: 0, flatShading: true });
  const bankCoinMaterial = new MeshStandardMaterial({
    color: "#e7c14a",
    roughness: 0.4,
    metalness: 0.65,
    flatShading: true,
    emissive: "#8a6512",
    emissiveIntensity: 0.25
  });
  // Aether tower: slender dark-stone shaft topped by a glowing violet
  // crystal — reads as arcane infrastructure rather than a fort tower.
  const aetherStoneMaterial = new MeshStandardMaterial({ color: "#4a4258", roughness: 0.9, metalness: 0.05, flatShading: true });
  const aetherCrownMaterial = new MeshStandardMaterial({ color: "#7a6a96", roughness: 0.6, metalness: 0.4, flatShading: true });
  const aetherCrystalMaterial = new MeshStandardMaterial({
    color: "#b888ff",
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    emissive: "#7a3acc",
    emissiveIntensity: 0.85
  });
  // Aegis dome: translucent cyan shield half-sphere over a stone base,
  // ringed by four small emitter pylons with cyan crystal tips. The
  // dome is its own emissive-translucent material so the silhouette
  // reads as a force field rather than a building.
  const aegisStoneMaterial = new MeshStandardMaterial({ color: "#8c8c92", roughness: 0.92, metalness: 0, flatShading: true });
  const aegisCoreMaterial = new MeshStandardMaterial({ color: "#2c2e34", roughness: 0.5, metalness: 0.6, flatShading: true });
  const aegisDomeMaterial = new MeshStandardMaterial({
    color: "#7ad9f0",
    roughness: 0.35,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.45,
    emissive: "#2a9ec0",
    emissiveIntensity: 0.55,
    depthWrite: false
  });
  const aegisCrystalMaterial = new MeshStandardMaterial({
    color: "#9ce8f8",
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    emissive: "#2a9ec0",
    emissiveIntensity: 0.8
  });
  // World engine: three-tier ancient ziggurat with a central spire and
  // a massive golden core crystal — the signature late-game uniques
  // should feel weightier than any economic structure.
  const worldEngineStoneMaterial = new MeshStandardMaterial({ color: "#8a7a5a", roughness: 0.94, metalness: 0.02, flatShading: true });
  const worldEngineDarkMaterial = new MeshStandardMaterial({ color: "#2a241e", roughness: 0.86, metalness: 0.1, flatShading: true });
  const worldEngineCoreMaterial = new MeshStandardMaterial({
    color: "#ffd34a",
    roughness: 0.25,
    metalness: 0.4,
    flatShading: true,
    emissive: "#d68a18",
    emissiveIntensity: 0.95
  });
  // Imperial exchange: marble drum + columns under a gold dome with a
  // gold finial — visually grandest of the civic buildings.
  const exchangeMarbleMaterial = new MeshStandardMaterial({ color: "#eee6d2", roughness: 0.78, metalness: 0.05, flatShading: true });
  const exchangeColumnMaterial = new MeshStandardMaterial({ color: "#f6f0df", roughness: 0.76, metalness: 0.05, flatShading: true });
  const exchangeDomeMaterial = new MeshStandardMaterial({
    color: "#e8b840",
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
    emissive: "#7a5210",
    emissiveIntensity: 0.18
  });

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
  // Market: long counter, two thin awning planks (alternating red/white
  // stripes), two posts, two small crates with a knob of produce.
  const marketCounterGeo = new BoxGeometry(0.40, 0.05, 0.16);
  const marketAwningGeo = new BoxGeometry(0.40, 0.012, 0.10);
  const marketPostGeo = new CylinderGeometry(0.014, 0.014, 0.22, 6);
  const marketCrateGeo = new BoxGeometry(0.07, 0.06, 0.07);
  const marketProduceGeo = new IcosahedronGeometry(0.025, 0);
  // Observatory: cylindrical stone drum, hemispherical dome, dark slit
  // running across the dome, and a brass telescope poking through it.
  const observatoryBaseGeo = new CylinderGeometry(0.14, 0.16, 0.20, 16);
  // SphereGeometry(radius, wSeg, hSeg, phiStart, phiLength, thetaStart,
  // thetaLength) — last two args clip to the upper half for a dome.
  const observatoryDomeGeo = new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const observatorySlitGeo = new BoxGeometry(0.04, 0.03, 0.18);
  const observatoryTelescopeGeo = new CylinderGeometry(0.018, 0.022, 0.16, 8);
  // Octahedron — same shape family as the GEMS resource overlay, so the
  // crystal on the observatory and the crystals in the mine cart read
  // as the same material.
  const blueCrystalGeo = new OctahedronGeometry(0.045, 0);
  // Granary: wider boxier barn than the farmstead's, three horizontal
  // grain bands across the front face, a hipped golden roof, plus a
  // small grey-roofed annex and a cupola on top.
  const granaryBodyGeo = new BoxGeometry(0.34, 0.22, 0.24);
  const granaryRoofGeo = new ConeGeometry(0.26, 0.14, 4);
  const granaryBandGeo = new BoxGeometry(0.32, 0.018, 0.018);
  const granaryAnnexBodyGeo = new BoxGeometry(0.14, 0.18, 0.20);
  const granaryAnnexRoofGeo = new ConeGeometry(0.13, 0.07, 4);
  const granaryCupolaGeo = new BoxGeometry(0.05, 0.07, 0.05);
  const granaryCupolaRoofGeo = new ConeGeometry(0.045, 0.04, 4);
  const granarySackGeo = new BoxGeometry(0.06, 0.05, 0.05);
  // Seed granary: three stout stone silos in a row with copper conical
  // caps and a single dark band, plus a small lab annex with a green
  // glowing window. Silos are noticeably taller than they are wide so
  // the silhouette reads vertical from any orbit angle.
  const seedSiloBodyGeo = new CylinderGeometry(0.06, 0.065, 0.30, 12);
  const seedSiloBandGeo = new CylinderGeometry(0.064, 0.068, 0.022, 12);
  const seedSiloCapGeo = new ConeGeometry(0.07, 0.07, 12);
  const seedLabBodyGeo = new BoxGeometry(0.18, 0.14, 0.14);
  const seedLabRoofGeo = new ConeGeometry(0.13, 0.07, 4);
  const seedLabWindowGeo = new BoxGeometry(0.012, 0.06, 0.08);
  // Bank: body + step + pyramidal roof + 2 columns + 1 coin stack.
  const bankBodyGeo = new BoxGeometry(0.32, 0.18, 0.22);
  const bankStepGeo = new BoxGeometry(0.38, 0.04, 0.10);
  const bankRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const bankColumnGeo = new CylinderGeometry(0.022, 0.022, 0.16, 10);
  const bankCoinGeo = new CylinderGeometry(0.04, 0.04, 0.025, 12);
  // Aether tower: plinth + tall shaft + crown ring + crystal spike.
  const aetherBaseGeo = new CylinderGeometry(0.10, 0.12, 0.05, 12);
  const aetherShaftGeo = new CylinderGeometry(0.06, 0.075, 0.40, 10);
  const aetherCrownGeo = new CylinderGeometry(0.085, 0.07, 0.035, 12);
  const aetherCrystalGeo = new OctahedronGeometry(0.05, 0);
  // Aegis dome: base disk + central control core + half-sphere shield
  // + 4 emitter pylons (cylinder + crystal tip).
  const aegisBaseGeo = new CylinderGeometry(0.22, 0.24, 0.04, 18);
  const aegisCoreGeo = new BoxGeometry(0.10, 0.08, 0.10);
  const aegisDomeGeo = new SphereGeometry(0.20, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const aegisPylonGeo = new CylinderGeometry(0.018, 0.022, 0.10, 6);
  const aegisPylonTipGeo = new OctahedronGeometry(0.028, 0);
  // World engine: 3 ziggurat tiers + central spire + huge core crystal.
  const worldEngineTier1Geo = new BoxGeometry(0.44, 0.10, 0.32);
  const worldEngineTier2Geo = new BoxGeometry(0.30, 0.10, 0.22);
  const worldEngineTier3Geo = new BoxGeometry(0.18, 0.10, 0.14);
  const worldEngineSpireGeo = new CylinderGeometry(0.022, 0.045, 0.22, 8);
  const worldEngineCoreGeo = new OctahedronGeometry(0.08, 0);
  // Imperial exchange: wide stepped base + drum + dome + 4 columns + finial.
  const exchangeBaseGeo = new CylinderGeometry(0.22, 0.24, 0.04, 18);
  const exchangeDrumGeo = new CylinderGeometry(0.16, 0.16, 0.18, 18);
  const exchangeDomeGeo = new SphereGeometry(0.16, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const exchangeColumnGeo = new CylinderGeometry(0.020, 0.020, 0.18, 8);
  const exchangeFinialGeo = new ConeGeometry(0.030, 0.06, 12);

  type Slot = { mesh: InstancedMesh; count: number; cap: number };
  const slots = new Map<string, Slot>();
  const make = (
    key: string,
    geo: BoxGeometry | ConeGeometry | CylinderGeometry | IcosahedronGeometry | OctahedronGeometry | SphereGeometry,
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
  // Market — counter + 2 alternating awning stripes + 2 posts + 2 crates
  // + a small produce ball per crate.
  make("marketCounter", marketCounterGeo, marketCounterMaterial, C);
  make("marketAwningRed", marketAwningGeo, marketAwningRedMaterial, C);
  make("marketAwningWhite", marketAwningGeo, marketAwningWhiteMaterial, C);
  make("marketPost", marketPostGeo, marketPostMaterial, C * 2);
  make("marketCrate", marketCrateGeo, marketCrateMaterial, C * 2);
  make("marketProduce", marketProduceGeo, marketProduceMaterial, C * 2);
  // Observatory — stone drum + dome + slit + telescope + a glowing
  // blue power crystal jutting from the dome.
  make("observatoryBase", observatoryBaseGeo, observatoryStoneMaterial, C);
  make("observatoryDome", observatoryDomeGeo, observatoryDomeMaterial, C);
  make("observatorySlit", observatorySlitGeo, observatorySlitMaterial, C);
  make("observatoryTelescope", observatoryTelescopeGeo, observatoryTelescopeMaterial, C);
  make("observatoryCrystal", blueCrystalGeo, blueCrystalMaterial, C);
  // Crystal load for the MINE cart when the underlying resource is
  // GEMS — replaces the grey iron ore octahedrons on those tiles.
  make("mineCrystal", blueCrystalGeo, blueCrystalMaterial, C * 3);
  // Granary — barn + 3 grain bands + annex + cupola + 2 sacks
  make("granaryBody", granaryBodyGeo, granaryWallMaterial, C);
  make("granaryRoof", granaryRoofGeo, granaryRoofMaterial, C);
  make("granaryBand", granaryBandGeo, granaryBandMaterial, C * 3);
  make("granaryAnnexBody", granaryAnnexBodyGeo, granaryAnnexRoofMaterial, C);
  make("granaryAnnexRoof", granaryAnnexRoofGeo, granaryAnnexRoofMaterial, C);
  make("granaryCupola", granaryCupolaGeo, granaryCupolaMaterial, C);
  make("granaryCupolaRoof", granaryCupolaRoofGeo, granaryAnnexRoofMaterial, C);
  make("granarySack", granarySackGeo, granarySackMaterial, C * 2);
  // Seed granary — 3 silos (body + band + cap each) + lab annex (body +
  // roof + glowing window).
  make("seedSiloBody", seedSiloBodyGeo, seedSiloMaterial, C * 3);
  make("seedSiloBand", seedSiloBandGeo, seedSiloBandMaterial, C * 3);
  make("seedSiloCap", seedSiloCapGeo, seedSiloCapMaterial, C * 3);
  make("seedLabBody", seedLabBodyGeo, seedLabWallMaterial, C);
  make("seedLabRoof", seedLabRoofGeo, seedLabRoofMaterial, C);
  make("seedLabWindow", seedLabWindowGeo, seedLabGlowMaterial, C);
  // Bank
  make("bankBody", bankBodyGeo, bankWallMaterial, C);
  make("bankStep", bankStepGeo, bankTrimMaterial, C);
  make("bankRoof", bankRoofGeo, bankTrimMaterial, C);
  make("bankColumn", bankColumnGeo, bankTrimMaterial, C * 2);
  make("bankCoin", bankCoinGeo, bankCoinMaterial, C);
  // Aether tower
  make("aetherBase", aetherBaseGeo, aetherCrownMaterial, C);
  make("aetherShaft", aetherShaftGeo, aetherStoneMaterial, C);
  make("aetherCrown", aetherCrownGeo, aetherCrownMaterial, C);
  make("aetherCrystal", aetherCrystalGeo, aetherCrystalMaterial, C);
  // Aegis dome (4 pylons + 4 tips per instance)
  make("aegisBase", aegisBaseGeo, aegisStoneMaterial, C);
  make("aegisCore", aegisCoreGeo, aegisCoreMaterial, C);
  make("aegisDome", aegisDomeGeo, aegisDomeMaterial, C);
  make("aegisPylon", aegisPylonGeo, aegisStoneMaterial, C * 4);
  make("aegisPylonTip", aegisPylonTipGeo, aegisCrystalMaterial, C * 4);
  // World engine
  make("worldEngineTier1", worldEngineTier1Geo, worldEngineStoneMaterial, C);
  make("worldEngineTier2", worldEngineTier2Geo, worldEngineStoneMaterial, C);
  make("worldEngineTier3", worldEngineTier3Geo, worldEngineStoneMaterial, C);
  make("worldEngineSpire", worldEngineSpireGeo, worldEngineDarkMaterial, C);
  make("worldEngineCore", worldEngineCoreGeo, worldEngineCoreMaterial, C);
  // Imperial exchange (4 columns per instance)
  make("exchangeBase", exchangeBaseGeo, exchangeMarbleMaterial, C);
  make("exchangeDrum", exchangeDrumGeo, exchangeMarbleMaterial, C);
  make("exchangeDome", exchangeDomeGeo, exchangeDomeMaterial, C);
  make("exchangeColumn", exchangeColumnGeo, exchangeColumnMaterial, C * 4);
  make("exchangeFinial", exchangeFinialGeo, exchangeDomeMaterial, C);

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

  const addMine = (sx: number, sy: number, sz: number, resource: StructureResourceHint): void => {
    // Hill with dark archway + supporting beams, plus a mine cart with
    // ore (or crystals) loaded out front. The cart load swaps based on
    // the underlying resource so a player can still tell at a glance
    // whether the mine sits on IRON or GEMS — the structure-overlay
    // would otherwise look identical on both.
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
    if (resource === "GEMS") {
      // Three blue crystals jutting from the cart at random tilts.
      addPiece("mineCrystal", sx, sy, sz, 0.10, 0.12, 0.22, 0.8, 1.2, 0.8, 0, Math.PI * 0.05, Math.PI * 0.08);
      addPiece("mineCrystal", sx, sy, sz, 0.18, 0.13, 0.22, 0.9, 1.4, 0.9, 0, -Math.PI * 0.04, -Math.PI * 0.06);
      addPiece("mineCrystal", sx, sy, sz, 0.14, 0.16, 0.21, 0.7, 1.0, 0.7, Math.PI * 0.15, 0, 0);
    } else {
      addPiece("ore", sx, sy, sz, 0.10, 0.10, 0.22);
      addPiece("ore", sx, sy, sz, 0.16, 0.10, 0.22);
      addPiece("ore", sx, sy, sz, 0.13, 0.13, 0.22);
    }
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

  const addMarket = (sx: number, sy: number, sz: number): void => {
    // Open-air stall reading from above as a striped awning over a long
    // counter. Two support posts at front corners, two crates of produce
    // along the back. Awning is two thin planks stacked at slight Z
    // offsets so red/white stripes read as a tilted canopy.
    addPiece("marketCounter", sx, sy, sz, 0, 0.04, 0.04);
    addPiece("marketPost", sx, sy, sz, -0.18, 0.11, 0.10);
    addPiece("marketPost", sx, sy, sz, 0.18, 0.11, 0.10);
    // Awning planks: tilted slightly forward (rotX) so the canopy leans
    // toward the front of the stall. White over red gives the striped
    // read even at small on-screen sizes.
    addPiece("marketAwningRed", sx, sy, sz, 0, 0.22, 0.02, 1, 1, 1, 0, Math.PI * 0.10, 0);
    addPiece("marketAwningWhite", sx, sy, sz, 0, 0.24, 0.10, 1, 1, 1, 0, Math.PI * 0.10, 0);
    // Crates along the back edge with a knob of produce on top.
    addPiece("marketCrate", sx, sy, sz, -0.12, 0.10, -0.04);
    addPiece("marketProduce", sx, sy, sz, -0.12, 0.15, -0.04);
    addPiece("marketCrate", sx, sy, sz, 0.12, 0.10, -0.04);
    addPiece("marketProduce", sx, sy, sz, 0.12, 0.15, -0.04);
  };

  const addObservatory = (sx: number, sy: number, sz: number): void => {
    // Stone drum with a half-sphere dome on top. A dark slit runs across
    // the dome, a brass telescope barrel pokes through it at a 30° pitch,
    // and a glowing blue power crystal juts from the dome's shoulder —
    // gives the silhouette a clear "astronomy + arcane research" read
    // distinct from forts and towers.
    addPiece("observatoryBase", sx, sy, sz, 0, 0.10, 0);
    addPiece("observatoryDome", sx, sy, sz, 0, 0.20, 0);
    // Slit sits just above the dome surface so it reads as a recessed
    // opening rather than floating geometry.
    addPiece("observatorySlit", sx, sy, sz, 0, 0.22, 0);
    // Telescope angled up & forward (rotX tilts the cylinder away from
    // vertical along Z, rotZ keeps it aimed across the slit).
    addPiece(
      "observatoryTelescope",
      sx, sy, sz,
      0.02, 0.28, 0.05,
      1, 1, 1,
      0,
      Math.PI * 0.18,
      0
    );
    // Blue power crystal jutting from the back-left of the dome, tilted
    // outward so its spike is silhouetted against the sky from any angle.
    // Y-scale 1.6 elongates the octahedron into a spike; tiny rotZ tilt
    // makes it lean away from the telescope so they don't overlap.
    addPiece(
      "observatoryCrystal",
      sx, sy, sz,
      -0.09, 0.27, -0.05,
      0.9, 1.6, 0.9,
      0,
      0,
      -Math.PI * 0.12
    );
  };

  const addGranary = (sx: number, sy: number, sz: number): void => {
    // Wide cream-walled barn body with a pyramidal gold roof, three
    // horizontal grain bands wrapping the front face, a small grey side
    // annex with its own little roof, a cupola/ventilator on the main
    // roof, and a couple of grain sacks at the front. This silhouette is
    // squat and barn-shaped — taller than the farmstead barn but with no
    // silo — so it never gets confused with FARMSTEAD or SEED_GRANARY.
    addPiece("granaryBody", sx, sy, sz, -0.06, 0.11, 0);
    addPiece("granaryRoof", sx, sy, sz, -0.06, 0.29, 0, 1, 1, 1, Math.PI * 0.25);
    // Three bands stacked across the front (slightly forward of the wall
    // so they read as raised slats rather than painted lines).
    addPiece("granaryBand", sx, sy, sz, -0.06, 0.09, 0.125);
    addPiece("granaryBand", sx, sy, sz, -0.06, 0.13, 0.125);
    addPiece("granaryBand", sx, sy, sz, -0.06, 0.17, 0.125);
    // Side annex on the right with its own pyramidal roof.
    addPiece("granaryAnnexBody", sx, sy, sz, 0.18, 0.09, 0);
    addPiece("granaryAnnexRoof", sx, sy, sz, 0.18, 0.215, 0, 1, 1, 1, Math.PI * 0.25);
    // Cupola: small box + tiny pyramidal roof sitting on top of the main
    // roof, slightly offset toward the front.
    addPiece("granaryCupola", sx, sy, sz, -0.06, 0.385, 0.03);
    addPiece("granaryCupolaRoof", sx, sy, sz, -0.06, 0.44, 0.03, 1, 1, 1, Math.PI * 0.25);
    // Two grain sacks out front at slight offsets.
    addPiece("granarySack", sx, sy, sz, -0.18, 0.025, 0.18);
    addPiece("granarySack", sx, sy, sz, -0.10, 0.025, 0.20);
  };

  const addSeedGranary = (sx: number, sy: number, sz: number): void => {
    // Three tall stone silos with copper conical caps arranged in a
    // shallow arc across the back of the tile, plus a small seed-lab
    // annex with a green-glowing window at the front. The vertical silo
    // cluster + glowing green window read as advanced agronomy — clearly
    // different silhouette from the squat wooden granary.
    const silos: Array<readonly [number, number]> = [
      [-0.18, -0.08],
      [0.00, -0.10],
      [0.18, -0.08]
    ];
    for (const [ox, oz] of silos) {
      addPiece("seedSiloBody", sx, sy, sz, ox, 0.15, oz);
      addPiece("seedSiloBand", sx, sy, sz, ox, 0.22, oz);
      addPiece("seedSiloCap", sx, sy, sz, ox, 0.335, oz);
    }
    // Seed lab annex out front: small dark-roofed shed with a glowing
    // green window facing the camera.
    addPiece("seedLabBody", sx, sy, sz, 0, 0.07, 0.16);
    addPiece("seedLabRoof", sx, sy, sz, 0, 0.175, 0.16, 1, 1, 1, Math.PI * 0.25);
    // Window sits just outside the front wall so its emissive face isn't
    // co-planar with the wall (avoids z-fighting flicker).
    addPiece("seedLabWindow", sx, sy, sz, 0, 0.07, 0.235);
  };

  const addBank = (sx: number, sy: number, sz: number): void => {
    // Cream stone civic block with a low front step, two columns flanking
    // the entrance, a pyramidal roof, and a small gold coin stack on the
    // front step. Reads as a small civic / financial building, distinct
    // from the market stall (open awning) and the granary (golden roof).
    addPiece("bankStep", sx, sy, sz, 0, 0.025, 0.14);
    addPiece("bankBody", sx, sy, sz, 0, 0.13, 0);
    addPiece("bankRoof", sx, sy, sz, 0, 0.27, 0, 1, 1, 1, Math.PI * 0.25);
    addPiece("bankColumn", sx, sy, sz, -0.10, 0.12, 0.13);
    addPiece("bankColumn", sx, sy, sz, 0.10, 0.12, 0.13);
    addPiece("bankCoin", sx, sy, sz, -0.16, 0.06, 0.22);
  };

  const addAetherTower = (sx: number, sy: number, sz: number): void => {
    // Slender dark-stone shaft topped by a glowing violet crystal. Y-scale
    // 1.4 on the crystal elongates the octahedron into a spike so the
    // silhouette is unmistakable from any orbit angle.
    addPiece("aetherBase", sx, sy, sz, 0, 0.025, 0);
    addPiece("aetherShaft", sx, sy, sz, 0, 0.25, 0);
    addPiece("aetherCrown", sx, sy, sz, 0, 0.47, 0);
    addPiece("aetherCrystal", sx, sy, sz, 0, 0.55, 0, 1, 1.4, 1);
  };

  const addAegisDome = (sx: number, sy: number, sz: number): void => {
    // Stone disk foundation with a dark core block at the center, a
    // translucent cyan half-sphere shield over the top, and four small
    // emitter pylons at NE/SE/SW/NW corners each capped with a cyan
    // crystal. Dome is rendered with depthWrite:false + opacity 0.45 so
    // it reads as a force field, not a building.
    addPiece("aegisBase", sx, sy, sz, 0, 0.02, 0);
    addPiece("aegisCore", sx, sy, sz, 0, 0.08, 0);
    addPiece("aegisDome", sx, sy, sz, 0, 0.06, 0);
    const pylonOffsets: ReadonlyArray<readonly [number, number]> = [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17]
    ];
    for (const [ox, oz] of pylonOffsets) {
      addPiece("aegisPylon", sx, sy, sz, ox, 0.07, oz);
      addPiece("aegisPylonTip", sx, sy, sz, ox, 0.135, oz);
    }
  };

  const addWorldEngine = (sx: number, sy: number, sz: number): void => {
    // Three stacked ancient-stone tiers form a ziggurat. A short dark
    // obsidian spire rises from the top tier and supports a massive
    // golden core crystal that emits warm light. Y offsets stack the
    // tiers so each one half-clears the next.
    addPiece("worldEngineTier1", sx, sy, sz, 0, 0.05, 0);
    addPiece("worldEngineTier2", sx, sy, sz, 0, 0.15, 0);
    addPiece("worldEngineTier3", sx, sy, sz, 0, 0.25, 0);
    addPiece("worldEngineSpire", sx, sy, sz, 0, 0.41, 0);
    // Core crystal sits at the top of the spire, slightly elongated and
    // tilted 22.5° so its silhouette reads as a multi-faceted gem.
    addPiece("worldEngineCore", sx, sy, sz, 0, 0.56, 0, 1, 1.2, 1, Math.PI * 0.125, 0, 0);
  };

  const addImperialExchange = (sx: number, sy: number, sz: number): void => {
    // Wide marble stepped base, central drum, four columns set forward of
    // the drum at quarter positions, a golden dome on top, and a small
    // gold finial above the dome. The dome shares the goldish exchange
    // material, contrasting with the cream drum so the silhouette reads
    // as a domed civic building from any orbit angle.
    addPiece("exchangeBase", sx, sy, sz, 0, 0.02, 0);
    addPiece("exchangeDrum", sx, sy, sz, 0, 0.13, 0);
    addPiece("exchangeDome", sx, sy, sz, 0, 0.22, 0);
    addPiece("exchangeFinial", sx, sy, sz, 0, 0.41, 0);
    // 4 columns at cardinal points just outside the drum radius (drum
    // radius 0.16, columns at 0.20 so they read as a colonnade).
    const colOffsets: ReadonlyArray<readonly [number, number]> = [
      [0.20, 0],
      [-0.20, 0],
      [0, 0.20],
      [0, -0.20]
    ];
    for (const [ox, oz] of colOffsets) {
      addPiece("exchangeColumn", sx, sy, sz, ox, 0.13, oz);
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
    kind: StructureKind,
    resource: StructureResourceHint = undefined
  ): void => {
    if (kind === "FARMSTEAD") addFarmstead(sceneX, surfaceY, sceneZ);
    else if (kind === "WATERWORKS") addWaterworks(sceneX, surfaceY, sceneZ);
    else if (kind === "CAMP") addCamp(sceneX, surfaceY, sceneZ);
    else if (kind === "MINE") addMine(sceneX, surfaceY, sceneZ, resource);
    else if (kind === "IRONWORKS") addIronworks(sceneX, surfaceY, sceneZ);
    else if (kind === "MARKET") addMarket(sceneX, surfaceY, sceneZ);
    else if (kind === "OBSERVATORY") addObservatory(sceneX, surfaceY, sceneZ);
    else if (kind === "GRANARY") addGranary(sceneX, surfaceY, sceneZ);
    else if (kind === "SEED_GRANARY") addSeedGranary(sceneX, surfaceY, sceneZ);
    else if (kind === "BANK") addBank(sceneX, surfaceY, sceneZ);
    else if (kind === "AETHER_TOWER") addAetherTower(sceneX, surfaceY, sceneZ);
    else if (kind === "AEGIS_DOME") addAegisDome(sceneX, surfaceY, sceneZ);
    else if (kind === "WORLD_ENGINE") addWorldEngine(sceneX, surfaceY, sceneZ);
    else if (kind === "IMPERIAL_EXCHANGE") addImperialExchange(sceneX, surfaceY, sceneZ);
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
      forgeBaseGeo, forgeRoofGeo, forgeStoneFurnaceGeo, forgeChimneyGeo, forgeGlowGeo, anvilTopGeo, anvilBaseGeo,
      marketCounterGeo, marketAwningGeo, marketPostGeo, marketCrateGeo, marketProduceGeo,
      observatoryBaseGeo, observatoryDomeGeo, observatorySlitGeo, observatoryTelescopeGeo,
      blueCrystalGeo,
      granaryBodyGeo, granaryRoofGeo, granaryBandGeo, granaryAnnexBodyGeo, granaryAnnexRoofGeo, granaryCupolaGeo, granaryCupolaRoofGeo, granarySackGeo,
      seedSiloBodyGeo, seedSiloBandGeo, seedSiloCapGeo, seedLabBodyGeo, seedLabRoofGeo, seedLabWindowGeo,
      bankBodyGeo, bankStepGeo, bankRoofGeo, bankColumnGeo, bankCoinGeo,
      aetherBaseGeo, aetherShaftGeo, aetherCrownGeo, aetherCrystalGeo,
      aegisBaseGeo, aegisCoreGeo, aegisDomeGeo, aegisPylonGeo, aegisPylonTipGeo,
      worldEngineTier1Geo, worldEngineTier2Geo, worldEngineTier3Geo, worldEngineSpireGeo, worldEngineCoreGeo,
      exchangeBaseGeo, exchangeDrumGeo, exchangeDomeGeo, exchangeColumnGeo, exchangeFinialGeo
    ].forEach((g) => g.dispose());
    [
      barnRedMaterial, barnRoofMaterial, siloMaterial, woodFenceMaterial,
      stoneMaterial, stoneRoofMaterial, waterWheelMaterial, waterMaterial,
      tentCanvasMaterial, fireMaterial, drymeatRackMaterial, drymeatPeltMaterial,
      mineHillMaterial, mineDarkMaterial, mineBeamMaterial, mineCartMaterial, mineCartWheelMaterial, oreMaterial,
      forgeBaseMaterial, forgeStoneMaterial, forgeChimneyMaterial, forgeGlowMaterial, anvilMaterial,
      marketCounterMaterial, marketAwningRedMaterial, marketAwningWhiteMaterial, marketPostMaterial, marketCrateMaterial, marketProduceMaterial,
      observatoryStoneMaterial, observatoryDomeMaterial, observatorySlitMaterial, observatoryTelescopeMaterial,
      blueCrystalMaterial,
      granaryWallMaterial, granaryRoofMaterial, granaryAnnexRoofMaterial, granaryBandMaterial, granaryCupolaMaterial, granarySackMaterial,
      seedSiloMaterial, seedSiloBandMaterial, seedSiloCapMaterial, seedLabWallMaterial, seedLabRoofMaterial, seedLabGlowMaterial,
      bankWallMaterial, bankTrimMaterial, bankCoinMaterial,
      aetherStoneMaterial, aetherCrownMaterial, aetherCrystalMaterial,
      aegisStoneMaterial, aegisCoreMaterial, aegisDomeMaterial, aegisCrystalMaterial,
      worldEngineStoneMaterial, worldEngineDarkMaterial, worldEngineCoreMaterial,
      exchangeMarbleMaterial, exchangeColumnMaterial, exchangeDomeMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
