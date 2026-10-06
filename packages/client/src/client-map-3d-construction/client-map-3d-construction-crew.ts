import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import {
  CONSTRUCTION_CRATES_PER_PHASE,
  CREW_MAX,
  constructionCratesAt,
  type ConstructionSite
} from "../client-construction-phase/client-construction-phase.js";
import { DEFAULT_CONSTRUCTION_LAYOUT, type ConstructionLayout } from "./client-map-3d-construction-layout.js";
import { wanderPoint } from "../client-ancillary-wander/client-ancillary-wander.js";
import { createAncillaryFigureAssets, PERSON_Y } from "../client-map-3d-ancillary-figures/client-map-3d-ancillary-figures.js";

// Per-frame ambient life at a construction site (docs/construction-animation-plan.md):
// the parts stack the AFC delivered (crates that shrink as parts are used), and the
// ancillary crew working the site. The crew is the SAME black pinprick figures with the
// SAME random pause-and-walk wander as the settle overlay (client-map-3d-settle-overlay.ts),
// so a construction site reads as the same "people at work" players already know.
//
// Everything is a pure function of (site, clock): nothing is stored per site besides the
// entry itself, which the overlay re-adds on every rebuild.
export const MAX_CONSTRUCTION_SITES = 96;

// The parts stack position comes per site; see client-map-3d-construction-layout.ts.
// Figures wander the same tile-local area the settle overlay's people do (inside the tile edge).
const WANDER_SPAN = 0.84;
const CRATE_SIZE = { x: 0.075, y: 0.05, z: 0.075 };
const CRATE_SLOTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, CRATE_SIZE.y / 2, 0],
  [CRATE_SIZE.x + 0.01, CRATE_SIZE.y / 2, 0],
  [0, CRATE_SIZE.y / 2, CRATE_SIZE.z + 0.01],
  [(CRATE_SIZE.x + 0.01) / 2, CRATE_SIZE.y * 1.5, (CRATE_SIZE.z + 0.01) / 2]
];
type SiteEntry = {
  readonly sceneX: number;
  readonly sceneZ: number;
  readonly surfaceY: number;
  readonly site: ConstructionSite;
  readonly layout: ConstructionLayout;
};

export type ConstructionCrewLayer = {
  readonly clear: () => void;
  readonly add: (sceneX: number, sceneZ: number, surfaceY: number, site: ConstructionSite, layout?: ConstructionLayout) => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createConstructionCrewLayer = (scene: Scene): ConstructionCrewLayer => {
  const { geometry: figureGeometry, material: figureMaterial } = createAncillaryFigureAssets();
  const crateGeometry = new BoxGeometry(CRATE_SIZE.x, CRATE_SIZE.y, CRATE_SIZE.z);
  // Cyan glow: freshly fabricated stock straight from the AFC (the same power-on
  // cyan its drop effect uses).
  const crateMaterial = new MeshStandardMaterial({ color: "#46505c", emissive: "#4fd8ff", emissiveIntensity: 0.45, roughness: 0.55, metalness: 0.5, flatShading: true });

  const figureMesh = new InstancedMesh(figureGeometry, figureMaterial, MAX_CONSTRUCTION_SITES * CREW_MAX);
  const crateMesh = new InstancedMesh(crateGeometry, crateMaterial, MAX_CONSTRUCTION_SITES * CONSTRUCTION_CRATES_PER_PHASE);
  const meshes = [figureMesh, crateMesh];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Deliberately no castShadow: crates and figures are a few pixels tall at gameplay zoom, so their shadows would cost a shadow-pass draw for nothing.
  }
  scene.add(...meshes);

  const entries: SiteEntry[] = [];
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const identity = new Quaternion();

  const clear = (): void => {
    entries.length = 0;
  };

  const add: ConstructionCrewLayer["add"] = (sceneX, sceneZ, surfaceY, site, layout = DEFAULT_CONSTRUCTION_LAYOUT) => {
    if (entries.length >= MAX_CONSTRUCTION_SITES) return;
    entries.push({ sceneX, sceneZ, surfaceY, site, layout });
  };

  const upload = (mesh: InstancedMesh): void => {
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const update = (nowMs: number): void => {
    // The common case is no site on screen: skip the clock read and the buffer syncs.
    if (entries.length === 0 && figureMesh.count === 0 && crateMesh.count === 0) return;
    const epochMs = Date.now();
    let figures = 0;
    let crates = 0;
    for (const { sceneX, sceneZ, surfaceY, site, layout } of entries) {
      const crew = Math.min(site.crew, CREW_MAX);
      const crateCount = constructionCratesAt(site.direction, site.startedAtMs, site.completesAtMs, site.pausedAtMs ?? epochMs);
      for (let c = 0; c < crateCount; c += 1) {
        const slot = CRATE_SLOTS[c]!;
        position.set(sceneX + layout.stackX + slot[0], surfaceY + slot[1], sceneZ + layout.stackZ + slot[2]);
        matrix.compose(position, identity, scale.set(1, 1, 1));
        crateMesh.setMatrixAt(crates, matrix);
        crates += 1;
      }

      // A stalled (overdue) build freezes the crew where it stands; otherwise they wander like settlers.
      const wanderTime = site.stalled ? 0 : nowMs;
      for (let i = 0; i < crew; i += 1) {
        const point = wanderPoint(wanderTime, site.x, site.y, i);
        position.set(sceneX + (point.x - 0.5) * WANDER_SPAN, surfaceY + PERSON_Y, sceneZ + (point.y - 0.5) * WANDER_SPAN);
        matrix.compose(position, identity, scale.set(1, 1, 1));
        figureMesh.setMatrixAt(figures, matrix);
        figures += 1;
      }
    }
    figureMesh.count = figures;
    crateMesh.count = crates;
    for (const mesh of meshes) upload(mesh);
  };

  const dispose = (): void => {
    scene.remove(...meshes);
    for (const mesh of meshes) mesh.dispose();
    figureGeometry.dispose();
    crateGeometry.dispose();
    figureMaterial.dispose();
    crateMaterial.dispose();
  };

  return { clear, add, update, dispose };
};
