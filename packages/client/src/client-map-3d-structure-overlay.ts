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
  | "IMPERIAL_EXCHANGE"
  | "AIRPORT"
  | "CARAVANARY"
  | "CUSTOMS_HOUSE"
  | "EXCHANGE_HOUSE"
  | "GARRISON_HALL"
  | "GOVERNORS_OFFICE"
  | "RAIL_DEPOT"
  | "RADAR_SYSTEM"
  | "FOUNDRY"
  | "ADVANCED_IRONWORKS"
  | "FUR_SYNTHESIZER"
  | "ADVANCED_FUR_SYNTHESIZER"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "ASTRAL_DOCK";

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
  "IMPERIAL_EXCHANGE",
  "AIRPORT",
  "CARAVANARY",
  "CUSTOMS_HOUSE",
  "EXCHANGE_HOUSE",
  "GARRISON_HALL",
  "GOVERNORS_OFFICE",
  "RAIL_DEPOT",
  "RADAR_SYSTEM",
  "FOUNDRY",
  "ADVANCED_IRONWORKS",
  "FUR_SYNTHESIZER",
  "ADVANCED_FUR_SYNTHESIZER",
  "CRYSTAL_SYNTHESIZER",
  "ADVANCED_CRYSTAL_SYNTHESIZER",
  "ASTRAL_DOCK"
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
  // Airport: low pale-grey hangar + tall white control tower with a
  // dark glass cab + a strip of asphalt runway. Reads as modern
  // transport infrastructure.
  const airportHangarMaterial = new MeshStandardMaterial({ color: "#aab2b8", roughness: 0.78, metalness: 0.15, flatShading: true });
  const airportRoofMaterial = new MeshStandardMaterial({ color: "#7e858a", roughness: 0.82, metalness: 0.18, flatShading: true });
  const airportTowerMaterial = new MeshStandardMaterial({ color: "#e8ecef", roughness: 0.75, metalness: 0.08, flatShading: true });
  const airportGlassMaterial = new MeshStandardMaterial({
    color: "#3a6680",
    roughness: 0.3,
    metalness: 0.55,
    flatShading: true,
    emissive: "#0e2030",
    emissiveIntensity: 0.25
  });
  const airportRunwayMaterial = new MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.94, metalness: 0, flatShading: true });
  const airportStripeMaterial = new MeshStandardMaterial({ color: "#e8e4d6", roughness: 0.88, metalness: 0, flatShading: true });
  // Caravanary: warm sand-stone perimeter walls + central well +
  // terracotta tents + brown cargo bundles. Desert trade post.
  const caravanaryStoneMaterial = new MeshStandardMaterial({ color: "#c9a972", roughness: 0.92, metalness: 0, flatShading: true });
  const caravanaryWellMaterial = new MeshStandardMaterial({ color: "#7a6a52", roughness: 0.92, metalness: 0, flatShading: true });
  const caravanaryTentMaterial = new MeshStandardMaterial({ color: "#b5563a", roughness: 0.86, metalness: 0, flatShading: true });
  const caravanaryCargoMaterial = new MeshStandardMaterial({ color: "#6a4a30", roughness: 0.9, metalness: 0, flatShading: true });
  // Customs house: small cream stone hut with a striped red/white gate
  // barrier and a couple of cargo bollards. Reads as a checkpoint.
  const customsWallMaterial = new MeshStandardMaterial({ color: "#dccab0", roughness: 0.9, metalness: 0, flatShading: true });
  const customsRoofMaterial = new MeshStandardMaterial({ color: "#7a3026", roughness: 0.88, metalness: 0, flatShading: true });
  const customsGateRedMaterial = new MeshStandardMaterial({ color: "#c63a2c", roughness: 0.84, metalness: 0, flatShading: true });
  const customsGateWhiteMaterial = new MeshStandardMaterial({ color: "#ece2cf", roughness: 0.84, metalness: 0, flatShading: true });
  const customsBollardMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.78, metalness: 0.2, flatShading: true });
  // Exchange house: stone block with a small pediment + 2 front columns
  // + a gold scale/sign hanging above the door. Smaller civic cousin of
  // the Imperial Exchange.
  const exchangeHouseWallMaterial = new MeshStandardMaterial({ color: "#d8cca8", roughness: 0.88, metalness: 0, flatShading: true });
  const exchangeHouseTrimMaterial = new MeshStandardMaterial({ color: "#f0e6d0", roughness: 0.86, metalness: 0, flatShading: true });
  const exchangeHouseSignMaterial = new MeshStandardMaterial({
    color: "#e0b850",
    roughness: 0.4,
    metalness: 0.55,
    flatShading: true,
    emissive: "#7a5818",
    emissiveIntensity: 0.2
  });
  // Garrison hall: olive-green stone barracks with dark steep roof,
  // sandbag wall in front, and a red banner on a pole.
  const garrisonWallMaterial = new MeshStandardMaterial({ color: "#5e6a52", roughness: 0.9, metalness: 0, flatShading: true });
  const garrisonRoofMaterial = new MeshStandardMaterial({ color: "#3a342a", roughness: 0.92, metalness: 0, flatShading: true });
  const garrisonSandbagMaterial = new MeshStandardMaterial({ color: "#a89878", roughness: 0.94, metalness: 0, flatShading: true });
  const garrisonPoleMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.78, metalness: 0.18, flatShading: true });
  const garrisonBannerMaterial = new MeshStandardMaterial({ color: "#b22d2a", roughness: 0.82, metalness: 0, flatShading: true });
  // Governor's office: warm tan civic building with a deep red tiled
  // roof and a cupola topped with a small flag.
  const governorWallMaterial = new MeshStandardMaterial({ color: "#cdb78a", roughness: 0.88, metalness: 0, flatShading: true });
  const governorRoofMaterial = new MeshStandardMaterial({ color: "#9c4030", roughness: 0.88, metalness: 0, flatShading: true });
  const governorCupolaMaterial = new MeshStandardMaterial({ color: "#e8dcc2", roughness: 0.88, metalness: 0, flatShading: true });
  const governorFlagMaterial = new MeshStandardMaterial({ color: "#c83a2a", roughness: 0.82, metalness: 0, flatShading: true });
  // Rail depot: red-brick station with grey-tile flat roof, a pair of
  // dark iron rails set into wood sleepers, and a signal mast with a
  // small red light.
  const railWallMaterial = new MeshStandardMaterial({ color: "#8a4836", roughness: 0.9, metalness: 0, flatShading: true });
  const railRoofMaterial = new MeshStandardMaterial({ color: "#4a4842", roughness: 0.88, metalness: 0, flatShading: true });
  const railIronMaterial = new MeshStandardMaterial({ color: "#2a2c2e", roughness: 0.6, metalness: 0.5, flatShading: true });
  const railSleeperMaterial = new MeshStandardMaterial({ color: "#3a2e22", roughness: 0.92, metalness: 0, flatShading: true });
  const railSignalLightMaterial = new MeshStandardMaterial({
    color: "#ff5a3a",
    roughness: 0.4,
    metalness: 0,
    flatShading: true,
    emissive: "#c2261a",
    emissiveIntensity: 0.85
  });
  // Radar system: white-grey metal control box + tall pylon + tilted
  // shallow dish with a thin antenna spike.
  const radarBodyMaterial = new MeshStandardMaterial({ color: "#dde2e6", roughness: 0.6, metalness: 0.35, flatShading: true });
  const radarPylonMaterial = new MeshStandardMaterial({ color: "#4a4e52", roughness: 0.5, metalness: 0.55, flatShading: true });
  const radarDishMaterial = new MeshStandardMaterial({ color: "#e8ecf0", roughness: 0.4, metalness: 0.4, flatShading: true });
  // Foundry & Advanced Ironworks share the ironworks palette plus a
  // slag-pile material. Slag glows faintly so the silhouette reads as
  // "hotter / more industrial" than the regular ironworks.
  const slagMaterial = new MeshStandardMaterial({
    color: "#5a3028",
    roughness: 0.86,
    metalness: 0.12,
    flatShading: true,
    emissive: "#ff4a12",
    emissiveIntensity: 0.35
  });
  // Synthesizers (fur + crystal, basic + advanced): industrial chamber
  // family. Dark steel base, brushed-steel chamber, translucent inner
  // window with a glowing inner material (amber for fur, cyan for
  // crystal). Tubes and tube caps are shared between all four variants.
  const synthBaseMaterial = new MeshStandardMaterial({ color: "#3e4248", roughness: 0.7, metalness: 0.35, flatShading: true });
  const synthChamberMaterial = new MeshStandardMaterial({ color: "#b6bcc0", roughness: 0.5, metalness: 0.55, flatShading: true });
  const synthTubeMaterial = new MeshStandardMaterial({ color: "#5a5e62", roughness: 0.6, metalness: 0.5, flatShading: true });
  const furGlowMaterial = new MeshStandardMaterial({
    color: "#f0a662",
    roughness: 0.35,
    metalness: 0.1,
    flatShading: true,
    emissive: "#c95a18",
    emissiveIntensity: 0.85
  });
  const crystalChamberMaterial = new MeshStandardMaterial({
    color: "#9cd6e8",
    roughness: 0.4,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.55,
    emissive: "#2a8eb8",
    emissiveIntensity: 0.55,
    depthWrite: false
  });
  // Reuse blueCrystalMaterial (defined earlier for OBSERVATORY/MINE)
  // for the crystal-synthesizer cores so the visual language stays
  // consistent across "blue power crystal" usages.
  // Astral dock: aether-tinted launch platform. Dark stone pad with a
  // glowing cyan ring, four tilted arch columns, a central spire, and
  // a floating violet crystal core.
  const astralPadMaterial = new MeshStandardMaterial({ color: "#221a2e", roughness: 0.84, metalness: 0.18, flatShading: true });
  const astralRingMaterial = new MeshStandardMaterial({
    color: "#88d8f0",
    roughness: 0.4,
    metalness: 0.15,
    flatShading: true,
    emissive: "#2a8ec0",
    emissiveIntensity: 0.95
  });
  const astralArchMaterial = new MeshStandardMaterial({ color: "#3a3146", roughness: 0.7, metalness: 0.35, flatShading: true });
  const astralSpireMaterial = new MeshStandardMaterial({ color: "#2c2438", roughness: 0.6, metalness: 0.55, flatShading: true });
  const astralCoreMaterial = new MeshStandardMaterial({
    color: "#c08aff",
    roughness: 0.3,
    metalness: 0.25,
    flatShading: true,
    emissive: "#7a3acc",
    emissiveIntensity: 1.0
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
  // Airport: low wide hangar + flat roof + tall control tower + glass
  // cab + long runway strip + a few painted stripes.
  const airportHangarGeo = new BoxGeometry(0.30, 0.10, 0.18);
  const airportRoofGeo = new BoxGeometry(0.32, 0.025, 0.20);
  const airportTowerGeo = new CylinderGeometry(0.035, 0.045, 0.32, 8);
  const airportCabGeo = new BoxGeometry(0.07, 0.04, 0.07);
  const airportRunwayGeo = new BoxGeometry(0.40, 0.008, 0.06);
  const airportStripeGeo = new BoxGeometry(0.03, 0.010, 0.012);
  // Caravanary: 1 wall geo used 4× per instance with rotation + a
  // small stone well + 2 conical tents + 2 cargo boxes.
  const caravanaryWallGeo = new BoxGeometry(0.32, 0.10, 0.025);
  const caravanaryWellGeo = new CylinderGeometry(0.04, 0.045, 0.06, 10);
  const caravanaryTentGeo = new ConeGeometry(0.08, 0.07, 4);
  const caravanaryCargoGeo = new BoxGeometry(0.05, 0.05, 0.07);
  // Customs house: stone hut + pyramidal roof + striped gate barrier
  // (pole + red+white bar + small white stripe) + bollard.
  const customsBodyGeo = new BoxGeometry(0.20, 0.13, 0.16);
  const customsRoofGeo = new ConeGeometry(0.15, 0.08, 4);
  const customsGatePoleGeo = new CylinderGeometry(0.011, 0.011, 0.14, 6);
  const customsGateArmGeo = new BoxGeometry(0.22, 0.014, 0.014);
  const customsGateStripeGeo = new BoxGeometry(0.055, 0.016, 0.016);
  const customsBollardGeo = new CylinderGeometry(0.016, 0.018, 0.05, 6);
  // Exchange house: stepped base + body + small pediment roof + 2
  // front columns + gold scale/sign block.
  const exchangeHouseStepGeo = new BoxGeometry(0.26, 0.04, 0.18);
  const exchangeHouseBodyGeo = new BoxGeometry(0.22, 0.12, 0.16);
  const exchangeHouseRoofGeo = new ConeGeometry(0.16, 0.08, 4);
  const exchangeHouseColumnGeo = new CylinderGeometry(0.018, 0.018, 0.12, 8);
  const exchangeHouseSignGeo = new OctahedronGeometry(0.025, 0);
  // Garrison hall: long barracks + steep pitched roof + 3 sandbags
  // along the front + flag pole + small red banner.
  const garrisonBodyGeo = new BoxGeometry(0.34, 0.13, 0.18);
  const garrisonRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const garrisonSandbagGeo = new BoxGeometry(0.07, 0.035, 0.035);
  const garrisonPoleGeo = new CylinderGeometry(0.007, 0.007, 0.22, 5);
  const garrisonBannerGeo = new BoxGeometry(0.07, 0.05, 0.004);
  // Governor's office: stepped base + body + roof + cupola + cupola
  // roof + small flag on top.
  const governorStepGeo = new BoxGeometry(0.32, 0.04, 0.16);
  const governorBodyGeo = new BoxGeometry(0.28, 0.14, 0.20);
  const governorRoofGeo = new ConeGeometry(0.22, 0.10, 4);
  const governorCupolaGeo = new BoxGeometry(0.07, 0.08, 0.07);
  const governorCupolaRoofGeo = new ConeGeometry(0.055, 0.05, 4);
  const governorFlagGeo = new BoxGeometry(0.05, 0.035, 0.004);
  // Rail depot: long station body + flat overhanging roof + 2 rails +
  // 4 sleepers + signal mast + small red signal lamp.
  const railBodyGeo = new BoxGeometry(0.30, 0.12, 0.16);
  const railRoofGeo = new BoxGeometry(0.34, 0.025, 0.20);
  const railRailGeo = new BoxGeometry(0.34, 0.008, 0.010);
  const railSleeperGeo = new BoxGeometry(0.020, 0.005, 0.07);
  const railSignalMastGeo = new CylinderGeometry(0.008, 0.008, 0.14, 5);
  const railSignalLightGeo = new BoxGeometry(0.022, 0.022, 0.018);
  // Radar system: control box + flat top + tall pylon + tilted shallow
  // dish + thin antenna spike.
  const radarBodyGeo = new BoxGeometry(0.12, 0.10, 0.12);
  const radarTopGeo = new BoxGeometry(0.13, 0.02, 0.13);
  const radarPylonGeo = new CylinderGeometry(0.012, 0.014, 0.22, 8);
  // SphereGeometry top-cap clipped to a shallow bowl, rotated to face up.
  const radarDishGeo = new SphereGeometry(0.10, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const radarAntennaGeo = new CylinderGeometry(0.0055, 0.0055, 0.08, 5);
  // Foundry: bigger version of ironworks. Wider base + bigger roof +
  // bigger furnace + bigger glow + 2 chimneys + slag pile.
  const foundryBaseGeo = new BoxGeometry(0.40, 0.20, 0.30);
  const foundryRoofGeo = new ConeGeometry(0.28, 0.10, 4);
  const foundryFurnaceGeo = new BoxGeometry(0.20, 0.24, 0.18);
  const foundryGlowGeo = new BoxGeometry(0.08, 0.08, 0.08);
  const foundryChimneyGeo = new BoxGeometry(0.07, 0.34, 0.07);
  const slagPileGeo = new ConeGeometry(0.08, 0.05, 6);
  // Advanced ironworks: between ironworks and foundry. Reuses forge
  // materials; new geos for a taller furnace + 2nd chimney.
  const advIronBaseGeo = new BoxGeometry(0.36, 0.18, 0.26);
  const advIronRoofGeo = new ConeGeometry(0.25, 0.10, 4);
  const advIronFurnaceGeo = new BoxGeometry(0.18, 0.22, 0.16);
  const advIronChimneyGeo = new BoxGeometry(0.06, 0.32, 0.06);
  // Synthesizer family: shared chamber + cap + window-slit + tube +
  // tube-cap pieces. Two base geos (basic + advanced) sized for 1-tank
  // vs 2-tank layouts.
  const synthBaseGeo = new BoxGeometry(0.20, 0.08, 0.16);
  const synthAdvBaseGeo = new BoxGeometry(0.32, 0.10, 0.18);
  const synthChamberGeo = new CylinderGeometry(0.07, 0.07, 0.18, 12);
  const synthChamberCapGeo = new ConeGeometry(0.075, 0.04, 12);
  const synthWindowGeo = new BoxGeometry(0.022, 0.10, 0.04);
  const synthTubeGeo = new CylinderGeometry(0.010, 0.010, 0.10, 6);
  const synthTubeCapGeo = new ConeGeometry(0.012, 0.022, 6);
  // Crystal synthesizer chamber: translucent cylinder + an inner core
  // octahedron (reuses blueCrystalGeo/blueCrystalMaterial). Same chamber
  // shape as fur but with a different (translucent cyan) material.
  const crystalChamberGeo = new CylinderGeometry(0.075, 0.075, 0.18, 12);
  const crystalCoreGeo = new OctahedronGeometry(0.045, 0);
  // Astral dock: flat dark pad + glowing ring + 4 tilted arch columns
  // + central spire + floating crystal core.
  const astralPadGeo = new CylinderGeometry(0.22, 0.24, 0.03, 20);
  const astralRingGeo = new CylinderGeometry(0.18, 0.18, 0.014, 24);
  const astralArchGeo = new CylinderGeometry(0.012, 0.012, 0.30, 6);
  const astralSpireGeo = new ConeGeometry(0.040, 0.18, 8);
  const astralCoreGeo = new OctahedronGeometry(0.05, 0);

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
  // Airport
  make("airportHangar", airportHangarGeo, airportHangarMaterial, C);
  make("airportRoof", airportRoofGeo, airportRoofMaterial, C);
  make("airportTower", airportTowerGeo, airportTowerMaterial, C);
  make("airportCab", airportCabGeo, airportGlassMaterial, C);
  make("airportRunway", airportRunwayGeo, airportRunwayMaterial, C);
  make("airportStripe", airportStripeGeo, airportStripeMaterial, C * 3);
  // Caravanary
  make("caravanaryWall", caravanaryWallGeo, caravanaryStoneMaterial, C * 4);
  make("caravanaryWell", caravanaryWellGeo, caravanaryWellMaterial, C);
  make("caravanaryTent", caravanaryTentGeo, caravanaryTentMaterial, C * 2);
  make("caravanaryCargo", caravanaryCargoGeo, caravanaryCargoMaterial, C * 2);
  // Customs house
  make("customsBody", customsBodyGeo, customsWallMaterial, C);
  make("customsRoof", customsRoofGeo, customsRoofMaterial, C);
  make("customsGatePole", customsGatePoleGeo, customsBollardMaterial, C);
  make("customsGateArm", customsGateArmGeo, customsGateRedMaterial, C);
  make("customsGateStripe", customsGateStripeGeo, customsGateWhiteMaterial, C);
  make("customsBollard", customsBollardGeo, customsBollardMaterial, C * 2);
  // Exchange house (2 columns per instance)
  make("exchangeHouseStep", exchangeHouseStepGeo, exchangeHouseTrimMaterial, C);
  make("exchangeHouseBody", exchangeHouseBodyGeo, exchangeHouseWallMaterial, C);
  make("exchangeHouseRoof", exchangeHouseRoofGeo, exchangeHouseTrimMaterial, C);
  make("exchangeHouseColumn", exchangeHouseColumnGeo, exchangeHouseTrimMaterial, C * 2);
  make("exchangeHouseSign", exchangeHouseSignGeo, exchangeHouseSignMaterial, C);
  // Garrison hall (3 sandbags per instance)
  make("garrisonBody", garrisonBodyGeo, garrisonWallMaterial, C);
  make("garrisonRoof", garrisonRoofGeo, garrisonRoofMaterial, C);
  make("garrisonSandbag", garrisonSandbagGeo, garrisonSandbagMaterial, C * 3);
  make("garrisonPole", garrisonPoleGeo, garrisonPoleMaterial, C);
  make("garrisonBanner", garrisonBannerGeo, garrisonBannerMaterial, C);
  // Governor's office
  make("governorStep", governorStepGeo, governorCupolaMaterial, C);
  make("governorBody", governorBodyGeo, governorWallMaterial, C);
  make("governorRoof", governorRoofGeo, governorRoofMaterial, C);
  make("governorCupola", governorCupolaGeo, governorCupolaMaterial, C);
  make("governorCupolaRoof", governorCupolaRoofGeo, governorRoofMaterial, C);
  make("governorFlag", governorFlagGeo, governorFlagMaterial, C);
  // Rail depot (2 rails + 4 sleepers per instance)
  make("railBody", railBodyGeo, railWallMaterial, C);
  make("railRoof", railRoofGeo, railRoofMaterial, C);
  make("railRail", railRailGeo, railIronMaterial, C * 2);
  make("railSleeper", railSleeperGeo, railSleeperMaterial, C * 4);
  make("railSignalMast", railSignalMastGeo, railIronMaterial, C);
  make("railSignalLight", railSignalLightGeo, railSignalLightMaterial, C);
  // Radar system
  make("radarBody", radarBodyGeo, radarBodyMaterial, C);
  make("radarTop", radarTopGeo, radarPylonMaterial, C);
  make("radarPylon", radarPylonGeo, radarPylonMaterial, C);
  make("radarDish", radarDishGeo, radarDishMaterial, C);
  make("radarAntenna", radarAntennaGeo, radarPylonMaterial, C);
  // Foundry (2 chimneys per instance, shared forge palette + slag)
  make("foundryBase", foundryBaseGeo, forgeBaseMaterial, C);
  make("foundryRoof", foundryRoofGeo, barnRoofMaterial, C);
  make("foundryFurnace", foundryFurnaceGeo, forgeStoneMaterial, C);
  make("foundryGlow", foundryGlowGeo, forgeGlowMaterial, C);
  make("foundryChimney", foundryChimneyGeo, forgeChimneyMaterial, C * 2);
  make("slagPile", slagPileGeo, slagMaterial, C);
  // Advanced ironworks (2 chimneys per instance, shared forge palette)
  make("advIronBase", advIronBaseGeo, forgeBaseMaterial, C);
  make("advIronRoof", advIronRoofGeo, barnRoofMaterial, C);
  make("advIronFurnace", advIronFurnaceGeo, forgeStoneMaterial, C);
  make("advIronGlow", foundryGlowGeo, forgeGlowMaterial, C);
  make("advIronChimney", advIronChimneyGeo, forgeChimneyMaterial, C * 2);
  // Synthesizer pieces — caps sized for advanced variants (2 chambers,
  // 2 tubes, etc.). Materials are shared between basic and advanced.
  make("synthBase", synthBaseGeo, synthBaseMaterial, C);
  make("synthAdvBase", synthAdvBaseGeo, synthBaseMaterial, C);
  make("synthChamber", synthChamberGeo, synthChamberMaterial, C * 2);
  make("synthChamberCap", synthChamberCapGeo, synthChamberMaterial, C * 2);
  make("furWindow", synthWindowGeo, furGlowMaterial, C * 2);
  make("synthTube", synthTubeGeo, synthTubeMaterial, C * 3);
  make("synthTubeCap", synthTubeCapGeo, synthTubeMaterial, C * 3);
  // Crystal synthesizer chamber + core. Inner core uses the
  // pre-existing blueCrystalGeo/Material so the "blue power crystal"
  // material is consistent with observatory/mine.
  make("crystalChamber", crystalChamberGeo, crystalChamberMaterial, C * 2);
  make("crystalCore", crystalCoreGeo, blueCrystalMaterial, C * 3);
  // Astral dock (4 arches per instance)
  make("astralPad", astralPadGeo, astralPadMaterial, C);
  make("astralRing", astralRingGeo, astralRingMaterial, C);
  make("astralArch", astralArchGeo, astralArchMaterial, C * 4);
  make("astralSpire", astralSpireGeo, astralSpireMaterial, C);
  make("astralCore", astralCoreGeo, astralCoreMaterial, C);

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

  const addAirport = (sx: number, sy: number, sz: number): void => {
    // Low hangar at the back of the tile + thin flat roof + a tall
    // control tower at the front-right with a dark glass cab. A long
    // asphalt runway runs across the front with 3 painted centerline
    // stripes for "active runway" read.
    addPiece("airportHangar", sx, sy, sz, -0.04, 0.07, -0.10);
    addPiece("airportRoof", sx, sy, sz, -0.04, 0.135, -0.10);
    addPiece("airportTower", sx, sy, sz, 0.20, 0.18, -0.06);
    addPiece("airportCab", sx, sy, sz, 0.20, 0.36, -0.06);
    addPiece("airportRunway", sx, sy, sz, 0, 0.008, 0.18);
    addPiece("airportStripe", sx, sy, sz, -0.12, 0.014, 0.18);
    addPiece("airportStripe", sx, sy, sz, 0, 0.014, 0.18);
    addPiece("airportStripe", sx, sy, sz, 0.12, 0.014, 0.18);
  };

  const addCaravanary = (sx: number, sy: number, sz: number): void => {
    // 4 sand-stone walls form a courtyard. Walls on N/S keep default
    // orientation; E/W walls rotate 90° around Y so the long axis points
    // N-S. Central well + 2 conical tents inside the courtyard + 2
    // cargo bundles flanking the entrance.
    addPiece("caravanaryWall", sx, sy, sz, 0, 0.05, -0.16);
    addPiece("caravanaryWall", sx, sy, sz, 0, 0.05, 0.16);
    addPiece("caravanaryWall", sx, sy, sz, -0.16, 0.05, 0, 1, 1, 1, Math.PI * 0.5);
    addPiece("caravanaryWall", sx, sy, sz, 0.16, 0.05, 0, 1, 1, 1, Math.PI * 0.5);
    addPiece("caravanaryWell", sx, sy, sz, 0, 0.03, 0);
    // Tents rotated to face the well, on slight diagonals from the well.
    addPiece("caravanaryTent", sx, sy, sz, -0.09, 0.035, -0.06, 1, 1, 1, Math.PI * 0.25);
    addPiece("caravanaryTent", sx, sy, sz, 0.09, 0.035, 0.06, 1, 1, 1, Math.PI * 0.25);
    addPiece("caravanaryCargo", sx, sy, sz, -0.07, 0.025, 0.10);
    addPiece("caravanaryCargo", sx, sy, sz, 0.07, 0.025, 0.10);
  };

  const addCustomsHouse = (sx: number, sy: number, sz: number): void => {
    // Cream-stone hut with a deep-red pyramidal roof and a striped
    // gate barrier across the front of the tile. The "stripe" is a
    // small white block overlaid on the red bar so the silhouette
    // reads as a checkpoint from any angle. Two bollards flank the
    // approach.
    addPiece("customsBody", sx, sy, sz, -0.06, 0.085, -0.04);
    addPiece("customsRoof", sx, sy, sz, -0.06, 0.20, -0.04, 1, 1, 1, Math.PI * 0.25);
    addPiece("customsGatePole", sx, sy, sz, 0.16, 0.07, 0.10);
    // Gate arm extends across the road from the pole.
    addPiece("customsGateArm", sx, sy, sz, 0.05, 0.14, 0.10);
    addPiece("customsGateStripe", sx, sy, sz, 0.05, 0.14, 0.10);
    addPiece("customsBollard", sx, sy, sz, -0.16, 0.025, 0.20);
    addPiece("customsBollard", sx, sy, sz, 0.16, 0.025, 0.20);
  };

  const addExchangeHouse = (sx: number, sy: number, sz: number): void => {
    // Small cream-stone block with a pyramidal cap roof, a front step,
    // 2 columns flanking the door, and a small gold scale/sign
    // octahedron mounted above the doorway. Reads as a smaller cousin
    // of the Imperial Exchange — civic but not domed.
    addPiece("exchangeHouseStep", sx, sy, sz, 0, 0.025, 0.12);
    addPiece("exchangeHouseBody", sx, sy, sz, 0, 0.105, 0);
    addPiece("exchangeHouseRoof", sx, sy, sz, 0, 0.21, 0, 1, 1, 1, Math.PI * 0.25);
    addPiece("exchangeHouseColumn", sx, sy, sz, -0.08, 0.105, 0.10);
    addPiece("exchangeHouseColumn", sx, sy, sz, 0.08, 0.105, 0.10);
    // Sign elongated on Y for a "diamond" silhouette above the door.
    addPiece("exchangeHouseSign", sx, sy, sz, 0, 0.17, 0.085, 1, 1.4, 1);
  };

  const addGarrisonHall = (sx: number, sy: number, sz: number): void => {
    // Long olive-stone barracks with a steep dark roof, 3 sandbags
    // arrayed in front, and a red banner on a tall pole at one side.
    addPiece("garrisonBody", sx, sy, sz, 0, 0.085, -0.02);
    addPiece("garrisonRoof", sx, sy, sz, 0, 0.21, -0.02, 1, 1, 1, Math.PI * 0.25);
    addPiece("garrisonSandbag", sx, sy, sz, -0.12, 0.0175, 0.16);
    addPiece("garrisonSandbag", sx, sy, sz, 0, 0.0175, 0.16);
    addPiece("garrisonSandbag", sx, sy, sz, 0.12, 0.0175, 0.16);
    addPiece("garrisonPole", sx, sy, sz, 0.18, 0.13, -0.16);
    // Banner offset to one side of the pole so it reads as hanging.
    addPiece("garrisonBanner", sx, sy, sz, 0.21, 0.20, -0.16);
  };

  const addGovernorsOffice = (sx: number, sy: number, sz: number): void => {
    // Tan civic building with deep-red pyramidal roof, broad front step,
    // small cream-cupola + tiny pyramidal cupola roof, and a red flag.
    addPiece("governorStep", sx, sy, sz, 0, 0.025, 0.12);
    addPiece("governorBody", sx, sy, sz, 0, 0.115, 0);
    addPiece("governorRoof", sx, sy, sz, 0, 0.235, 0, 1, 1, 1, Math.PI * 0.25);
    addPiece("governorCupola", sx, sy, sz, 0, 0.325, 0);
    addPiece("governorCupolaRoof", sx, sy, sz, 0, 0.39, 0, 1, 1, 1, Math.PI * 0.25);
    addPiece("governorFlag", sx, sy, sz, 0.025, 0.44, 0);
  };

  const addRailDepot = (sx: number, sy: number, sz: number): void => {
    // Red-brick station body at the back with a flat grey overhanging
    // roof. A pair of dark iron rails crosses the front of the tile,
    // resting on 4 wooden sleepers. A short signal mast with a red
    // emissive lamp sits at the front-right corner.
    addPiece("railBody", sx, sy, sz, 0, 0.07, -0.10);
    addPiece("railRoof", sx, sy, sz, 0, 0.143, -0.10);
    addPiece("railRail", sx, sy, sz, 0, 0.012, 0.16);
    addPiece("railRail", sx, sy, sz, 0, 0.012, 0.22);
    addPiece("railSleeper", sx, sy, sz, -0.12, 0.005, 0.19);
    addPiece("railSleeper", sx, sy, sz, -0.04, 0.005, 0.19);
    addPiece("railSleeper", sx, sy, sz, 0.04, 0.005, 0.19);
    addPiece("railSleeper", sx, sy, sz, 0.12, 0.005, 0.19);
    addPiece("railSignalMast", sx, sy, sz, 0.18, 0.08, 0.10);
    addPiece("railSignalLight", sx, sy, sz, 0.18, 0.16, 0.10);
  };

  const addRadarSystem = (sx: number, sy: number, sz: number): void => {
    // Squat white-grey control box at ground level with a flat dark
    // top; a tall metal pylon rises from beside it; a shallow tilted
    // dish (sphere top-cap) is mounted at the pylon's tip with a thin
    // antenna spike poking from its center.
    addPiece("radarBody", sx, sy, sz, -0.08, 0.05, 0.05);
    addPiece("radarTop", sx, sy, sz, -0.08, 0.11, 0.05);
    addPiece("radarPylon", sx, sy, sz, 0.06, 0.13, -0.04);
    // Dish tilted ~40° backward (rotX negative) and rotated to scan one
    // direction. Y offset places it just above the pylon top.
    addPiece("radarDish", sx, sy, sz, 0.06, 0.26, -0.04, 1, 1, 1, 0, -Math.PI * 0.22, 0);
    addPiece("radarAntenna", sx, sy, sz, 0.06, 0.30, -0.04);
  };

  const addFoundry = (sx: number, sy: number, sz: number): void => {
    // Bigger forge: wider stone base, taller roof, taller stone furnace
    // with a strong glow, 2 chimneys side-by-side, and a glowing slag
    // pile next to the structure. Visually heavier than IRONWORKS.
    addPiece("foundryBase", sx, sy, sz, -0.08, 0.10, -0.04);
    addPiece("foundryRoof", sx, sy, sz, -0.08, 0.27, -0.04, 1, 1, 1, Math.PI * 0.25);
    addPiece("foundryFurnace", sx, sy, sz, 0.20, 0.12, -0.04);
    addPiece("foundryGlow", sx, sy, sz, 0.20, 0.08, 0.06);
    addPiece("foundryChimney", sx, sy, sz, 0.16, 0.34, -0.10);
    addPiece("foundryChimney", sx, sy, sz, 0.24, 0.34, -0.10);
    addPiece("slagPile", sx, sy, sz, -0.20, 0.025, 0.18);
  };

  const addAdvancedIronworks = (sx: number, sy: number, sz: number): void => {
    // Step up from IRONWORKS: bigger base, taller chimney, plus a
    // second chimney and a glow window on the furnace. No slag pile —
    // that's reserved for FOUNDRY.
    addPiece("advIronBase", sx, sy, sz, -0.06, 0.09, -0.04);
    addPiece("advIronRoof", sx, sy, sz, -0.06, 0.245, -0.04, 1, 1, 1, Math.PI * 0.25);
    addPiece("advIronFurnace", sx, sy, sz, 0.18, 0.11, -0.04);
    addPiece("advIronGlow", sx, sy, sz, 0.18, 0.07, 0.05);
    addPiece("advIronChimney", sx, sy, sz, 0.14, 0.32, -0.10);
    addPiece("advIronChimney", sx, sy, sz, 0.22, 0.32, -0.10);
  };

  const addFurSynthesizer = (sx: number, sy: number, sz: number): void => {
    // Single industrial chamber on a dark steel base. Brushed-steel
    // cylinder with a domed cap, a glowing amber window strip facing
    // the camera, and an exhaust tube + vent cap on top of the cap.
    addPiece("synthBase", sx, sy, sz, 0, 0.04, 0);
    addPiece("synthChamber", sx, sy, sz, 0, 0.17, 0);
    addPiece("synthChamberCap", sx, sy, sz, 0, 0.28, 0);
    addPiece("furWindow", sx, sy, sz, 0.05, 0.17, 0.05);
    addPiece("synthTube", sx, sy, sz, 0, 0.35, 0);
    addPiece("synthTubeCap", sx, sy, sz, 0, 0.41, 0);
  };

  const addAdvancedFurSynthesizer = (sx: number, sy: number, sz: number): void => {
    // Wider base supporting 2 chambers side-by-side, each with its own
    // dome cap and amber window. A pair of exhaust tubes vent upward
    // and a third tube + cap sits between them as a central control
    // vent. Reads clearly as "2× the production of basic" silhouette.
    addPiece("synthAdvBase", sx, sy, sz, 0, 0.05, 0);
    addPiece("synthChamber", sx, sy, sz, -0.08, 0.19, 0);
    addPiece("synthChamberCap", sx, sy, sz, -0.08, 0.30, 0);
    addPiece("furWindow", sx, sy, sz, -0.03, 0.19, 0.05);
    addPiece("synthChamber", sx, sy, sz, 0.08, 0.19, 0);
    addPiece("synthChamberCap", sx, sy, sz, 0.08, 0.30, 0);
    addPiece("furWindow", sx, sy, sz, 0.13, 0.19, 0.05);
    addPiece("synthTube", sx, sy, sz, -0.08, 0.37, 0);
    addPiece("synthTubeCap", sx, sy, sz, -0.08, 0.43, 0);
    addPiece("synthTube", sx, sy, sz, 0.08, 0.37, 0);
    addPiece("synthTubeCap", sx, sy, sz, 0.08, 0.43, 0);
    addPiece("synthTube", sx, sy, sz, 0, 0.32, 0.06, 0.8, 0.6, 0.8);
  };

  const addCrystalSynthesizer = (sx: number, sy: number, sz: number): void => {
    // Translucent cyan chamber on a dark steel base with a single blue
    // crystal core suspended inside. Steel cap above and a thin
    // exhaust tube vent the chamber.
    addPiece("synthBase", sx, sy, sz, 0, 0.04, 0);
    addPiece("crystalChamber", sx, sy, sz, 0, 0.17, 0);
    addPiece("synthChamberCap", sx, sy, sz, 0, 0.28, 0);
    // Crystal core elongated to spike upward inside the chamber.
    addPiece("crystalCore", sx, sy, sz, 0, 0.16, 0, 1, 1.8, 1);
    addPiece("synthTube", sx, sy, sz, 0, 0.35, 0);
    addPiece("synthTubeCap", sx, sy, sz, 0, 0.41, 0);
  };

  const addAdvancedCrystalSynthesizer = (sx: number, sy: number, sz: number): void => {
    // Wider base with 2 translucent chambers + 2 crystal cores +
    // central larger crystal between them (so the silhouette doesn't
    // just read as "two basic synthesizers"). Two exhaust tubes vent
    // upward.
    addPiece("synthAdvBase", sx, sy, sz, 0, 0.05, 0);
    addPiece("crystalChamber", sx, sy, sz, -0.08, 0.19, 0);
    addPiece("synthChamberCap", sx, sy, sz, -0.08, 0.30, 0);
    addPiece("crystalCore", sx, sy, sz, -0.08, 0.18, 0, 1, 1.6, 1);
    addPiece("crystalChamber", sx, sy, sz, 0.08, 0.19, 0);
    addPiece("synthChamberCap", sx, sy, sz, 0.08, 0.30, 0);
    addPiece("crystalCore", sx, sy, sz, 0.08, 0.18, 0, 1, 1.6, 1);
    // Central larger core sits higher and tilted for a distinctive
    // multi-faceted silhouette between the two chambers.
    addPiece("crystalCore", sx, sy, sz, 0, 0.36, 0, 1.4, 1.8, 1.4, Math.PI * 0.15, 0, 0);
    addPiece("synthTube", sx, sy, sz, -0.08, 0.37, 0);
    addPiece("synthTubeCap", sx, sy, sz, -0.08, 0.43, 0);
    addPiece("synthTube", sx, sy, sz, 0.08, 0.37, 0);
    addPiece("synthTubeCap", sx, sy, sz, 0.08, 0.43, 0);
  };

  const addAstralDock = (sx: number, sy: number, sz: number): void => {
    // Dark aether-stone pad with a glowing cyan ring inset. Four arch
    // columns at NE/SE/SW/NW tilt 20° inward so they read as buttresses
    // arcing toward a central spire. The spire is a dark cone pointing
    // up, and a floating violet crystal core sits at its tip.
    addPiece("astralPad", sx, sy, sz, 0, 0.015, 0);
    addPiece("astralRing", sx, sy, sz, 0, 0.034, 0);
    const archOffsets: ReadonlyArray<readonly [number, number, number, number]> = [
      // [ox, oz, rotX_lean, rotZ_lean] — leans toward the center.
      [0.15, 0.15, -Math.PI * 0.11, -Math.PI * 0.11],
      [-0.15, 0.15, -Math.PI * 0.11, Math.PI * 0.11],
      [0.15, -0.15, Math.PI * 0.11, -Math.PI * 0.11],
      [-0.15, -0.15, Math.PI * 0.11, Math.PI * 0.11]
    ];
    for (const [ox, oz, rotX, rotZ] of archOffsets) {
      addPiece("astralArch", sx, sy, sz, ox, 0.18, oz, 1, 1, 1, 0, rotX, rotZ);
    }
    addPiece("astralSpire", sx, sy, sz, 0, 0.13, 0);
    // Core floats just above the spire tip, slightly elongated.
    addPiece("astralCore", sx, sy, sz, 0, 0.28, 0, 1, 1.4, 1);
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
    else if (kind === "AIRPORT") addAirport(sceneX, surfaceY, sceneZ);
    else if (kind === "CARAVANARY") addCaravanary(sceneX, surfaceY, sceneZ);
    else if (kind === "CUSTOMS_HOUSE") addCustomsHouse(sceneX, surfaceY, sceneZ);
    else if (kind === "EXCHANGE_HOUSE") addExchangeHouse(sceneX, surfaceY, sceneZ);
    else if (kind === "GARRISON_HALL") addGarrisonHall(sceneX, surfaceY, sceneZ);
    else if (kind === "GOVERNORS_OFFICE") addGovernorsOffice(sceneX, surfaceY, sceneZ);
    else if (kind === "RAIL_DEPOT") addRailDepot(sceneX, surfaceY, sceneZ);
    else if (kind === "RADAR_SYSTEM") addRadarSystem(sceneX, surfaceY, sceneZ);
    else if (kind === "FOUNDRY") addFoundry(sceneX, surfaceY, sceneZ);
    else if (kind === "ADVANCED_IRONWORKS") addAdvancedIronworks(sceneX, surfaceY, sceneZ);
    else if (kind === "FUR_SYNTHESIZER") addFurSynthesizer(sceneX, surfaceY, sceneZ);
    else if (kind === "ADVANCED_FUR_SYNTHESIZER") addAdvancedFurSynthesizer(sceneX, surfaceY, sceneZ);
    else if (kind === "CRYSTAL_SYNTHESIZER") addCrystalSynthesizer(sceneX, surfaceY, sceneZ);
    else if (kind === "ADVANCED_CRYSTAL_SYNTHESIZER") addAdvancedCrystalSynthesizer(sceneX, surfaceY, sceneZ);
    else if (kind === "ASTRAL_DOCK") addAstralDock(sceneX, surfaceY, sceneZ);
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
      exchangeBaseGeo, exchangeDrumGeo, exchangeDomeGeo, exchangeColumnGeo, exchangeFinialGeo,
      airportHangarGeo, airportRoofGeo, airportTowerGeo, airportCabGeo, airportRunwayGeo, airportStripeGeo,
      caravanaryWallGeo, caravanaryWellGeo, caravanaryTentGeo, caravanaryCargoGeo,
      customsBodyGeo, customsRoofGeo, customsGatePoleGeo, customsGateArmGeo, customsGateStripeGeo, customsBollardGeo,
      exchangeHouseStepGeo, exchangeHouseBodyGeo, exchangeHouseRoofGeo, exchangeHouseColumnGeo, exchangeHouseSignGeo,
      garrisonBodyGeo, garrisonRoofGeo, garrisonSandbagGeo, garrisonPoleGeo, garrisonBannerGeo,
      governorStepGeo, governorBodyGeo, governorRoofGeo, governorCupolaGeo, governorCupolaRoofGeo, governorFlagGeo,
      railBodyGeo, railRoofGeo, railRailGeo, railSleeperGeo, railSignalMastGeo, railSignalLightGeo,
      radarBodyGeo, radarTopGeo, radarPylonGeo, radarDishGeo, radarAntennaGeo,
      foundryBaseGeo, foundryRoofGeo, foundryFurnaceGeo, foundryGlowGeo, foundryChimneyGeo, slagPileGeo,
      advIronBaseGeo, advIronRoofGeo, advIronFurnaceGeo, advIronChimneyGeo,
      synthBaseGeo, synthAdvBaseGeo, synthChamberGeo, synthChamberCapGeo, synthWindowGeo, synthTubeGeo, synthTubeCapGeo,
      crystalChamberGeo, crystalCoreGeo,
      astralPadGeo, astralRingGeo, astralArchGeo, astralSpireGeo, astralCoreGeo
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
      exchangeMarbleMaterial, exchangeColumnMaterial, exchangeDomeMaterial,
      airportHangarMaterial, airportRoofMaterial, airportTowerMaterial, airportGlassMaterial, airportRunwayMaterial, airportStripeMaterial,
      caravanaryStoneMaterial, caravanaryWellMaterial, caravanaryTentMaterial, caravanaryCargoMaterial,
      customsWallMaterial, customsRoofMaterial, customsGateRedMaterial, customsGateWhiteMaterial, customsBollardMaterial,
      exchangeHouseWallMaterial, exchangeHouseTrimMaterial, exchangeHouseSignMaterial,
      garrisonWallMaterial, garrisonRoofMaterial, garrisonSandbagMaterial, garrisonPoleMaterial, garrisonBannerMaterial,
      governorWallMaterial, governorRoofMaterial, governorCupolaMaterial, governorFlagMaterial,
      railWallMaterial, railRoofMaterial, railIronMaterial, railSleeperMaterial, railSignalLightMaterial,
      radarBodyMaterial, radarPylonMaterial, radarDishMaterial,
      slagMaterial,
      synthBaseMaterial, synthChamberMaterial, synthTubeMaterial, furGlowMaterial, crystalChamberMaterial,
      astralPadMaterial, astralRingMaterial, astralArchMaterial, astralSpireMaterial, astralCoreMaterial
    ].forEach((m) => m.dispose());
  };

  return { clear, addInstance, commit, dispose };
};
