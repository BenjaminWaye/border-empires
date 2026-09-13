import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, OctahedronGeometry } from "three";

// Materials and geometries for client-map-3d-resource-overlay.ts, split out
// to keep that file under the 500-line cap. Pure construction with no
// dependency on the overlay's own closure (slots, matrices, addInstance) --
// createResourceOverlay() destructures this once per call.
export const createResourceOverlayAssets = () => {
  // ─── Materials (shared by piece type) ───────────────────────────────
  const veggieGreenMaterial = new MeshStandardMaterial({ color: "#7da94a", roughness: 0.88, metalness: 0, flatShading: true });
  const veggieRedMaterial = new MeshStandardMaterial({ color: "#c25a3a", roughness: 0.82, metalness: 0, flatShading: true });
  const woodLogMaterial = new MeshStandardMaterial({ color: "#8a5d3e", roughness: 0.88, metalness: 0, flatShading: true });
  const woodHutMaterial = new MeshStandardMaterial({ color: "#6a4530", roughness: 0.92, metalness: 0, flatShading: true });
  const woodRoofMaterial = new MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9, metalness: 0, flatShading: true });
  const sawBladeMaterial = new MeshStandardMaterial({ color: "#a8acb0", roughness: 0.4, metalness: 0.42, flatShading: true });
  const stoneMaterial = new MeshStandardMaterial({ color: "#7a7a7e", roughness: 0.92, metalness: 0, flatShading: true });
  const darkStoneMaterial = new MeshStandardMaterial({ color: "#3c3c40", roughness: 0.94, metalness: 0, flatShading: true });
  const ironOreMaterial = new MeshStandardMaterial({ color: "#6a6a72", roughness: 0.85, metalness: 0.15, flatShading: true });
  const chimneyMaterial = new MeshStandardMaterial({ color: "#4d4242", roughness: 0.92, metalness: 0, flatShading: true });
  // Cyan-blue with the SVG-matched bright top/dark side feel — flat
  // shading + very low roughness produces sharp facet highlights.
  const gemBlueMaterial = new MeshStandardMaterial({
    color: "#4cc3ff",
    roughness: 0.2,
    metalness: 0.45,
    flatShading: true,
    emissive: "#1a4d7a",
    emissiveIntensity: 0.35
  });
  const boatHullMaterial = new MeshStandardMaterial({ color: "#7a4d2e", roughness: 0.85, metalness: 0, flatShading: true });
  const boatMastMaterial = new MeshStandardMaterial({ color: "#d8caa8", roughness: 0.78, metalness: 0, flatShading: true });
  const fishingNetMaterial = new MeshStandardMaterial({ color: "#bdb39a", roughness: 0.9, metalness: 0, flatShading: true });
  const fishMaterial = new MeshStandardMaterial({ color: "#5fa3c8", roughness: 0.62, metalness: 0.05, flatShading: true });
  const furBodyMaterial = new MeshStandardMaterial({ color: "#9b6a3e", roughness: 0.92, metalness: 0, flatShading: true });
  const furPostMaterial = new MeshStandardMaterial({ color: "#5a3e2a", roughness: 0.9, metalness: 0, flatShading: true });
  const oilDerrickMaterial = new MeshStandardMaterial({ color: "#3a3530", roughness: 0.85, metalness: 0.15, flatShading: true });
  const oilPumpMaterial = new MeshStandardMaterial({ color: "#5a4a3a", roughness: 0.78, metalness: 0.25, flatShading: true });
  const oilPoolMaterial = new MeshStandardMaterial({ color: "#1a1612", roughness: 0.2, metalness: 0.65, flatShading: true });

  // ─── Geometries (shared) ────────────────────────────────────────────
  const veggieGeo = new BoxGeometry(0.06, 0.04, 0.06);
  const logGeo = new CylinderGeometry(0.05, 0.05, 0.32, 6);
  const hutBaseGeo = new BoxGeometry(0.24, 0.16, 0.2);
  const hutRoofGeo = new ConeGeometry(0.18, 0.12, 4);
  const sawBladeGeo = new CylinderGeometry(0.09, 0.09, 0.012, 12);
  const stoneSmallGeo = new IcosahedronGeometry(0.06, 0);
  const stoneLargeGeo = new IcosahedronGeometry(0.1, 0);
  const ironOreGeo = new IcosahedronGeometry(0.05, 0);
  const mineArchGeo = new BoxGeometry(0.16, 0.14, 0.04);
  const mineHillGeo = new ConeGeometry(0.22, 0.18, 6);
  const chimneyGeo = new BoxGeometry(0.08, 0.22, 0.08);
  // Faceted gem geometry: an octahedron (8-sided diamond). Per-instance
  // anisotropic Y-scale at addPiece time gives each crystal its spike
  // height; rank/size differs per crystal in the cluster.
  const gemCrystalGeo = new OctahedronGeometry(0.06, 0);
  const boatHullGeo = new BoxGeometry(0.32, 0.06, 0.14);
  const boatMastGeo = new CylinderGeometry(0.012, 0.012, 0.18, 5);
  const boatSailGeo = new BoxGeometry(0.012, 0.13, 0.1);
  const netRodGeo = new CylinderGeometry(0.014, 0.014, 0.32, 5);
  const fishGeo = new BoxGeometry(0.07, 0.025, 0.03);
  const furPostGeo = new CylinderGeometry(0.02, 0.022, 0.22, 5);
  const furBodyGeo = new BoxGeometry(0.13, 0.085, 0.018);
  // Dedicated tripod pieces — the legacy furPost/furBody stay around for
  // FISH's drying rack and any future small-prop reuse. Tripod legs are
  // a thicker, longer cylinder so the silhouette reads from the
  // perspective camera; the pelt is a wider draped hide.
  const furTripodPostGeo = new CylinderGeometry(0.028, 0.034, 0.30, 7);
  const furTripodBindingGeo = new BoxGeometry(0.055, 0.030, 0.055);
  // Pelt as a stretched diamond: OctahedronGeometry has 6 vertices
  // (top/bottom/left/right/front/back) and 8 triangular faces. Scaled
  // wide (X), tall (Y), and thin (Z) it reads as the classic "two
  // triangles joined" skin silhouette pulled taut between the front
  // posts, with just enough Z depth to keep a visible spine instead of
  // disappearing edge-on.
  const furTripodPeltGeo = new OctahedronGeometry(1, 0);
  furTripodPeltGeo.scale(0.105, 0.085, 0.018);
  const derrickLegGeo = new CylinderGeometry(0.012, 0.014, 0.34, 5);
  const derrickCapGeo = new BoxGeometry(0.08, 0.04, 0.08);
  const pumpBaseGeo = new BoxGeometry(0.18, 0.06, 0.1);
  const pumpArmGeo = new BoxGeometry(0.22, 0.04, 0.04);
  const pumpHeadGeo = new BoxGeometry(0.06, 0.12, 0.06);
  const oilPoolGeo = new CylinderGeometry(0.18, 0.18, 0.014, 12);

  return {
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
  };
};
