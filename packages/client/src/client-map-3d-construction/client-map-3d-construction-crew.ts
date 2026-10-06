import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import {
  CONSTRUCTION_CRATES_PER_PHASE,
  constructionCratesAt,
  type ConstructionSite
} from "../client-construction-phase/client-construction-phase.js";
import { DEFAULT_CONSTRUCTION_LAYOUT, type ConstructionLayout } from "./client-map-3d-construction-layout.js";
import { crewCycleState, crewSeed01 } from "../client-construction-phase/client-construction-crew-cycle.js";
import {
  createAncillaryFigureAssets,
  PERSON_H
} from "../client-map-3d-ancillary-figures/client-map-3d-ancillary-figures.js";

// Per-frame ambient life at a construction site (docs/construction-animation-plan.md):
// the parts stack the AFC delivered (crates that shrink as parts are used), and
// the ancillary crew that carries parts from the stack to the structure.
//
// Everything is a pure function of (site, clock): nothing is stored per site
// besides the entry itself, which the overlay re-adds on every rebuild. All
// figures at a site share ONE timing -- same step, same pause -- so they move
// in eerie lockstep: they are bodies of a single AI, not individual workers.
export const MAX_CONSTRUCTION_SITES = 96;
const MAX_CREW_PER_SITE = 6;

// Tile-local layout (stack position, work ring) comes per site; see client-map-3d-construction-layout.ts.
const CREW_SPREAD = 0.035;
const CRATE_SIZE = { x: 0.075, y: 0.05, z: 0.075 };
const CRATE_SLOTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, CRATE_SIZE.y / 2, 0],
  [CRATE_SIZE.x + 0.01, CRATE_SIZE.y / 2, 0],
  [0, CRATE_SIZE.y / 2, CRATE_SIZE.z + 0.01],
  [(CRATE_SIZE.x + 0.01) / 2, CRATE_SIZE.y * 1.5, (CRATE_SIZE.z + 0.01) / 2]
];
const PART_SIZE = 0.03;
const STALLED_STOOP = 0.7;
// The settle overlay's pinprick size is right for a swarm on a tile but too
// small for a crew that is the main thing happening at a construction site.
const CREW_SCALE = 2.4;
const FIGURE_HEIGHT = PERSON_H * CREW_SCALE;

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
  const partGeometry = new BoxGeometry(PART_SIZE, PART_SIZE, PART_SIZE);
  const partMaterial = new MeshStandardMaterial({ color: "#8a929c", roughness: 0.5, metalness: 0.6, flatShading: true });
  const crateGeometry = new BoxGeometry(CRATE_SIZE.x, CRATE_SIZE.y, CRATE_SIZE.z);
  // Cyan glow: freshly fabricated stock straight from the AFC (the same power-on
  // cyan its drop effect uses).
  const crateMaterial = new MeshStandardMaterial({ color: "#46505c", emissive: "#4fd8ff", emissiveIntensity: 0.45, roughness: 0.55, metalness: 0.5, flatShading: true });

  const figureMesh = new InstancedMesh(figureGeometry, figureMaterial, MAX_CONSTRUCTION_SITES * MAX_CREW_PER_SITE);
  const partMesh = new InstancedMesh(partGeometry, partMaterial, MAX_CONSTRUCTION_SITES * MAX_CREW_PER_SITE);
  const crateMesh = new InstancedMesh(crateGeometry, crateMaterial, MAX_CONSTRUCTION_SITES * CONSTRUCTION_CRATES_PER_PHASE);
  const meshes = [figureMesh, partMesh, crateMesh];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Deliberately no castShadow: crates, parts and figures are a few pixels tall at gameplay zoom, so their shadows would cost a shadow-pass draw for nothing.
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
    if (entries.length === 0 && figureMesh.count === 0 && partMesh.count === 0 && crateMesh.count === 0) return;
    const epochMs = Date.now();
    let figures = 0;
    let parts = 0;
    let crates = 0;
    for (const { sceneX, sceneZ, surfaceY, site, layout } of entries) {
      const seed = crewSeed01(site.x, site.y);
      const crew = Math.min(site.crew, MAX_CREW_PER_SITE);
      const crateCount = constructionCratesAt(site.direction, site.startedAtMs, site.completesAtMs, site.pausedAtMs ?? epochMs);
      for (let c = 0; c < crateCount; c += 1) {
        const slot = CRATE_SLOTS[c]!;
        position.set(sceneX + layout.stackX + slot[0], surfaceY + slot[1], sceneZ + layout.stackZ + slot[2]);
        matrix.compose(position, identity, scale.set(1, 1, 1));
        crateMesh.setMatrixAt(crates, matrix);
        crates += 1;
      }

      const { along, carrying } = crewCycleState(nowMs, seed, site.direction, site.stalled);

      for (let i = 0; i < crew; i += 1) {
        const angle = seed * Math.PI * 2 + (i / crew) * Math.PI * 2;
        const stackX = layout.stackX + CRATE_SIZE.x + ((i % 3) - 1) * CREW_SPREAD;
        const stackZ = layout.stackZ + CRATE_SIZE.z + Math.floor(i / 3) * CREW_SPREAD;
        const workX = Math.cos(angle) * layout.workRadius;
        const workZ = Math.sin(angle) * layout.workRadius;
        const lx = stackX + (workX - stackX) * along;
        const lz = stackZ + (workZ - stackZ) * along;
        const stoop = site.stalled ? STALLED_STOOP : 1;
        const height = FIGURE_HEIGHT * stoop;
        position.set(sceneX + lx, surfaceY + height / 2 + 0.005, sceneZ + lz);
        matrix.compose(position, identity, scale.set(CREW_SCALE, CREW_SCALE * stoop, CREW_SCALE));
        figureMesh.setMatrixAt(figures, matrix);
        figures += 1;
        if (carrying) {
          position.set(sceneX + lx, surfaceY + FIGURE_HEIGHT + PART_SIZE * 0.6, sceneZ + lz);
          matrix.compose(position, identity, scale.set(1, 1, 1));
          partMesh.setMatrixAt(parts, matrix);
          parts += 1;
        }
      }
    }
    figureMesh.count = figures;
    partMesh.count = parts;
    crateMesh.count = crates;
    for (const mesh of meshes) upload(mesh);
  };

  const dispose = (): void => {
    scene.remove(...meshes);
    for (const mesh of meshes) mesh.dispose();
    figureGeometry.dispose();
    partGeometry.dispose();
    crateGeometry.dispose();
    figureMaterial.dispose();
    partMaterial.dispose();
    crateMaterial.dispose();
  };

  return { clear, add, update, dispose };
};
