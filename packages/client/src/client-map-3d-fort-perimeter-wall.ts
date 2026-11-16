import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from "three";
import {
  FORT_PERIMETER_WALL_COLOR,
  fortPerimeterCoverage,
  fortPerimeterWallEdges,
  type FortPerimeterCoverage
} from "./client-fort-perimeter/client-fort-perimeter.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

// True-3D half of the fort perimeter wall (rule and 2D fallback:
// client-fort-perimeter.ts). A low instanced stone wall segment along each
// open side of a covered tile, inset to sit just inside the territory edge so
// it never overlaps buildings in the middle of the tile.

const WALL_HEIGHT = 0.07; // in tiles
const WALL_THICKNESS = 0.07;
const HALF = 0.5 - WALL_THICKNESS / 2;

export type FortPerimeterWallOverlay3D = {
  /** Called once per terrain rebuild, before the per-tile pass. */
  readonly begin: (state: Pick<ClientState, "tiles" | "tilesRevision" | "chunkFullCount">) => void;
  /** (sceneX, sceneZ) is the tile centre, surfaceY the terrain height there. */
  readonly addTile: (tile: Tile | undefined, sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type Segment = { x: number; y: number; z: number; alongZ: boolean };

export const createFortPerimeterWallOverlay3D = (scene: Scene, maxSegments: number): FortPerimeterWallOverlay3D => {
  // Slightly longer than a tile so neighbouring segments overlap at corners.
  const geometry = new BoxGeometry(1 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
  const material = new MeshStandardMaterial({ color: new Color(FORT_PERIMETER_WALL_COLOR), roughness: 0.92, metalness: 0 });
  const mesh = new InstancedMesh(geometry, material, maxSegments);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  let coverage: FortPerimeterCoverage | undefined;
  let segments: Segment[] = [];
  const matrix = new Matrix4();
  const rotateToZ = new Matrix4().makeRotationY(Math.PI / 2);

  const push = (segment: Segment): void => {
    if (segments.length < maxSegments) segments.push(segment);
  };

  return {
    begin: (state) => {
      segments = [];
      coverage = fortPerimeterCoverage(state);
    },
    addTile: (tile, sceneX, sceneZ, surfaceY) => {
      if (!tile || !coverage || coverage.size === 0) return;
      const edges = fortPerimeterWallEdges(tile, coverage);
      if (!edges) return;
      const y = surfaceY + WALL_HEIGHT / 2;
      if (edges.north) push({ x: sceneX, y, z: sceneZ - HALF, alongZ: false });
      if (edges.south) push({ x: sceneX, y, z: sceneZ + HALF, alongZ: false });
      if (edges.west) push({ x: sceneX - HALF, y, z: sceneZ, alongZ: true });
      if (edges.east) push({ x: sceneX + HALF, y, z: sceneZ, alongZ: true });
    },
    commit: () => {
      mesh.count = segments.length;
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i]!;
        if (segment.alongZ) matrix.copy(rotateToZ).setPosition(segment.x, segment.y, segment.z);
        else matrix.makeTranslation(segment.x, segment.y, segment.z);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    }
  };
};
