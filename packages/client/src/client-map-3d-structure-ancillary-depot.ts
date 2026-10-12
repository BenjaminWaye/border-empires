import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  OctahedronGeometry
} from "three";
import type { StructurePieceBuilder } from "./client-map-3d-structure-builder.js";

// Ancillary Depot (GARRISON_HALL, "Ancillary Depot") — the standing-army
// storehouse of the Manpower branch: a large circular storage drum of dormant
// Ancillary bodies, ringed by vertical body-shaped pods set like cartridges in
// a revolver cylinder. Each pod carries a recessed brass plate with a pale
// humanoid silhouette on its front and a small cyan aether visor, so the whole
// asset reads at a glance as "bodies on the shelf, ready for the hive".
// Palette: blackened iron shell, aged brass trim, one cyan aether light per
// pod plus the drum-core glow. Strong silhouette, very few parts.
export type AncillaryDepotStructureLayout = (
  sceneX: number,
  surfaceY: number,
  sceneZ: number
) => void;

// Revolver-cylinder arrangement: 8 body pods around the drum, evenly spaced.
export const DEPOT_POD_COUNT = 8;
const DEPOT_POD_RING_RADIUS = 0.165;

export const createAncillaryDepotLayout = (
  builder: StructurePieceBuilder
): AncillaryDepotStructureLayout => {
  const C = builder.maxTiles;

  // ─── Depot palette ──────────────────────────────────────────────────
  const adIronMaterial = new MeshStandardMaterial({ color: "#2b2620", roughness: 0.82, metalness: 0.3, flatShading: true });
  const adIronDarkMaterial = new MeshStandardMaterial({ color: "#1a1612", roughness: 0.86, metalness: 0.35, flatShading: true });
  const adBrassMaterial = new MeshStandardMaterial({ color: "#a97d33", roughness: 0.5, metalness: 0.6, flatShading: true });
  const adBrassDarkMaterial = new MeshStandardMaterial({ color: "#6e5020", roughness: 0.55, metalness: 0.5, flatShading: true });
  const adFigureMaterial = new MeshStandardMaterial({ color: "#c3c9cf", roughness: 0.7, metalness: 0.45, flatShading: true });
  const adCyanGlowMaterial = new MeshStandardMaterial({ color: "#66efff", roughness: 0.25, metalness: 0.05, flatShading: true, emissive: "#0fb8d8", emissiveIntensity: 1.1 });

  // ─── Geometries ─────────────────────────────────────────────────────
  const adBaseGeo = new CylinderGeometry(0.20, 0.22, 0.03, 8);
  const adDrumGeo = new CylinderGeometry(0.135, 0.15, 0.26, 12);
  const adBandGeo = new CylinderGeometry(0.155, 0.155, 0.012, 12);
  const adCapGeo = new CylinderGeometry(0.055, 0.135, 0.045, 12);
  const adHubGeo = new CylinderGeometry(0.045, 0.045, 0.012, 10);
  const adPodGeo = new BoxGeometry(0.105, 0.34, 0.09);
  const adPodPanelGeo = new BoxGeometry(0.085, 0.24, 0.012);
  const adTorsoGeo = new BoxGeometry(0.034, 0.082, 0.012);
  const adHeadGeo = new OctahedronGeometry(0.015, 0);
  const adVisorGeo = new OctahedronGeometry(0.008, 0);

  // ─── Slots ─────────────────────────────────────────────────────────
  builder.makeSlot("adBase", adBaseGeo, adIronDarkMaterial, C * 1);
  builder.makeSlot("adDrum", adDrumGeo, adIronMaterial, C * 1);
  builder.makeSlot("adBand", adBandGeo, adBrassMaterial, C * 2);
  builder.makeSlot("adCap", adCapGeo, adBrassDarkMaterial, C * 1);
  builder.makeSlot("adHub", adHubGeo, adCyanGlowMaterial, C * 1);
  builder.makeSlot("adPod", adPodGeo, adIronMaterial, C * DEPOT_POD_COUNT);
  builder.makeSlot("adPodPanel", adPodPanelGeo, adBrassDarkMaterial, C * DEPOT_POD_COUNT);
  builder.makeSlot("adTorso", adTorsoGeo, adFigureMaterial, C * DEPOT_POD_COUNT);
  builder.makeSlot("adHead", adHeadGeo, adFigureMaterial, C * DEPOT_POD_COUNT);
  builder.makeSlot("adVisor", adVisorGeo, adCyanGlowMaterial, C * DEPOT_POD_COUNT);

  // ─── Layout ────────────────────────────────────────────────────────
  const addAncillaryDepot: AncillaryDepotStructureLayout = (sx, sy, sz) => {
    builder.addPiece("adBase", sx, sy, sz, 0, 0.015, 0);
    builder.addPiece("adDrum", sx, sy, sz, 0, 0.16, 0);
    builder.addPiece("adBand", sx, sy, sz, 0, 0.09, 0);
    builder.addPiece("adBand", sx, sy, sz, 0, 0.235, 0);
    builder.addPiece("adCap", sx, sy, sz, 0, 0.3125, 0);
    builder.addPiece("adHub", sx, sy, sz, 0, 0.341, 0);
    for (let i = 0; i < DEPOT_POD_COUNT; i += 1) {
      const angle = (i / DEPOT_POD_COUNT) * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      builder.addPiece("adPod", sx, sy, sz, sin * DEPOT_POD_RING_RADIUS, 0.20, cos * DEPOT_POD_RING_RADIUS, 1, 1, 1, angle);
      builder.addPiece("adPodPanel", sx, sy, sz, sin * (DEPOT_POD_RING_RADIUS + 0.048), 0.185, cos * (DEPOT_POD_RING_RADIUS + 0.048), 1, 1, 1, angle);
      builder.addPiece("adTorso", sx, sy, sz, sin * (DEPOT_POD_RING_RADIUS + 0.058), 0.16, cos * (DEPOT_POD_RING_RADIUS + 0.058), 1, 1, 1, angle);
      builder.addPiece("adHead", sx, sy, sz, sin * (DEPOT_POD_RING_RADIUS + 0.058), 0.215, cos * (DEPOT_POD_RING_RADIUS + 0.058), 1, 1, 1, angle);
      builder.addPiece("adVisor", sx, sy, sz, sin * (DEPOT_POD_RING_RADIUS + 0.064), 0.215, cos * (DEPOT_POD_RING_RADIUS + 0.064), 1, 1, 1, angle);
    }
  };

  return addAncillaryDepot;
};