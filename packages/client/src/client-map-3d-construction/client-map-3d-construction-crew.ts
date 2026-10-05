import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import {
  CONSTRUCTION_CRATES_PER_PHASE,
  constructionCratesAt,
  type ConstructionSite
} from "../client-construction-phase/client-construction-phase.js";
import {
  createAncillaryFigureAssets,
  PERSON_H,
  PERSON_Y,
  wanderHash01
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

const WALK_MS = 2000;
const PICK_MS = 900;
const WORK_MS = 2400;
const CYCLE_MS = 2 * WALK_MS + PICK_MS + WORK_MS;

// Tile-local layout: the parts stack sits in the back-left corner, outside the
// scaffold footprint; the crew works on a ring around the structure.
const STACK_X = -0.4;
const STACK_Z = -0.4;
const WORK_RING_RADIUS = 0.2;
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

type SiteEntry = {
  readonly sceneX: number;
  readonly sceneZ: number;
  readonly surfaceY: number;
  readonly site: ConstructionSite;
};

export type ConstructionCrewLayer = {
  readonly clear: () => void;
  readonly add: (sceneX: number, sceneZ: number, surfaceY: number, site: ConstructionSite) => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

export const createConstructionCrewLayer = (scene: Scene): ConstructionCrewLayer => {
  const { geometry: figureGeometry, material: figureMaterial } = createAncillaryFigureAssets();
  const partGeometry = new BoxGeometry(PART_SIZE, PART_SIZE, PART_SIZE);
  const partMaterial = new MeshStandardMaterial({ color: "#8a929c", roughness: 0.5, metalness: 0.6, flatShading: true });
  const crateGeometry = new BoxGeometry(CRATE_SIZE.x, CRATE_SIZE.y, CRATE_SIZE.z);
  // Warm emissive: freshly fabricated stock straight from the AFC.
  const crateMaterial = new MeshStandardMaterial({ color: "#6b7a8f", emissive: "#ffb347", emissiveIntensity: 0.18, roughness: 0.55, metalness: 0.5, flatShading: true });

  const figureMesh = new InstancedMesh(figureGeometry, figureMaterial, MAX_CONSTRUCTION_SITES * MAX_CREW_PER_SITE);
  const partMesh = new InstancedMesh(partGeometry, partMaterial, MAX_CONSTRUCTION_SITES * MAX_CREW_PER_SITE);
  const crateMesh = new InstancedMesh(crateGeometry, crateMaterial, MAX_CONSTRUCTION_SITES * CONSTRUCTION_CRATES_PER_PHASE);
  const meshes = [figureMesh, partMesh, crateMesh];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
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

  const add: ConstructionCrewLayer["add"] = (sceneX, sceneZ, surfaceY, site) => {
    if (entries.length >= MAX_CONSTRUCTION_SITES) return;
    entries.push({ sceneX, sceneZ, surfaceY, site });
  };

  const upload = (mesh: InstancedMesh): void => {
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const update = (nowMs: number): void => {
    const epochMs = Date.now();
    let figures = 0;
    let parts = 0;
    let crates = 0;
    for (const { sceneX, sceneZ, surfaceY, site } of entries) {
      const seed = wanderHash01(site.x, site.y, 0, 5);
      const crew = Math.min(site.crew, MAX_CREW_PER_SITE);
      const crateCount = constructionCratesAt(site.direction, site.startedAtMs, site.completesAtMs, epochMs);
      for (let c = 0; c < crateCount; c += 1) {
        const slot = CRATE_SLOTS[c]!;
        position.set(sceneX + STACK_X + slot[0], surfaceY + slot[1], sceneZ + STACK_Z + slot[2]);
        matrix.compose(position, identity, scale.set(1, 1, 1));
        crateMesh.setMatrixAt(crates, matrix);
        crates += 1;
      }

      // Shared timing: one clock per site, offset per site so neighbours are
      // not in unison with each other, only within themselves.
      const t = (nowMs + seed * CYCLE_MS) % CYCLE_MS;
      const building = site.direction === "build";
      // Leg 0: stack -> structure (build) / structure -> stack (remove), carrying.
      // Leg 1: work/pack pause at the destination. Leg 2: walk back empty. Leg 3: pick up.
      let toward = 0; // 0 = at stack, 1 = at structure
      let carrying = false;
      if (site.stalled) {
        toward = 1;
      } else if (t < WALK_MS) {
        toward = smooth(t / WALK_MS);
        carrying = true;
      } else if (t < WALK_MS + WORK_MS) {
        toward = 1;
      } else if (t < 2 * WALK_MS + WORK_MS) {
        toward = 1 - smooth((t - WALK_MS - WORK_MS) / WALK_MS);
      }
      // For removal the crew carries parts the other way: structure -> stack.
      const along = building ? toward : 1 - toward;
      const carryingNow = carrying && !site.stalled;

      for (let i = 0; i < crew; i += 1) {
        const angle = seed * Math.PI * 2 + (i / crew) * Math.PI * 2;
        const stackX = STACK_X + CRATE_SIZE.x + ((i % 3) - 1) * CREW_SPREAD;
        const stackZ = STACK_Z + CRATE_SIZE.z + Math.floor(i / 3) * CREW_SPREAD;
        const workX = Math.cos(angle) * WORK_RING_RADIUS;
        const workZ = Math.sin(angle) * WORK_RING_RADIUS;
        const lx = stackX + (workX - stackX) * along;
        const lz = stackZ + (workZ - stackZ) * along;
        const stoop = site.stalled ? STALLED_STOOP : 1;
        position.set(sceneX + lx, surfaceY + PERSON_Y * stoop, sceneZ + lz);
        matrix.compose(position, identity, scale.set(1, stoop, 1));
        figureMesh.setMatrixAt(figures, matrix);
        figures += 1;
        if (carryingNow) {
          position.set(sceneX + lx, surfaceY + PERSON_H + PART_SIZE * 0.6, sceneZ + lz);
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
