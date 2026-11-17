import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from "three";
import type { FortVariant } from "@border-empires/shared";
import {
  FORT_PERIMETER_WALL_STYLES,
  fortPerimeterCoverage,
  fortPerimeterWallEdges,
  type FortPerimeterCoverage,
  type FortPerimeterCoverageState
} from "./client-fort-perimeter/client-fort-perimeter.js";
import type { Tile } from "./client-types.js";

// True-3D half of the fort perimeter wall (rule and 2D fallback:
// client-fort-perimeter.ts). Each open side of a covered tile gets a wall
// segment in the style of the strongest tier covering it
// (FORT_PERIMETER_WALL_STYLES: wooden fence, stone, titanium, dark metal),
// inset to sit just inside the territory edge so it never overlaps buildings
// in the middle of the tile. Palisade fences carry stakes along the top;
// the stone and metal walls carry battlements.

const VARIANTS: readonly FortVariant[] = ["PALISADE", "FORT", "TITANIUM_BASTION", "THUNDER_BASTION"];
const TOPPINGS_PER_SEGMENT = 4;

export type FortPerimeterWallOverlay3D = {
  /** Called once per terrain rebuild, before the per-tile pass. */
  readonly begin: (state: FortPerimeterCoverageState) => void;
  /** (sceneX, sceneZ) is the tile centre, surfaceY the terrain height there. */
  readonly addTile: (tile: Tile | undefined, sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type Segment = { x: number; y: number; z: number; alongZ: boolean };

type TierMeshes = {
  readonly wall: InstancedMesh;
  readonly topping: InstancedMesh;
  readonly half: number;
  readonly height: number;
  readonly toppingHeight: number;
  segments: Segment[];
};

const tierMeshes = (scene: Scene, variant: FortVariant, maxSegments: number): TierMeshes => {
  const style = FORT_PERIMETER_WALL_STYLES[variant];
  const material = new MeshStandardMaterial({ color: style.color, roughness: style.roughness, metalness: style.metalness, flatShading: true });
  // Slightly longer than a tile so neighbouring segments overlap at corners.
  const wall = new InstancedMesh(new BoxGeometry(1 + style.thickness, style.height, style.thickness), material, maxSegments);
  const posts = style.topping === "posts";
  const toppingHeight = posts ? style.height * 0.6 : style.height * 0.35;
  const toppingWidth = posts ? style.thickness * 0.8 : 1 / (TOPPINGS_PER_SEGMENT * 2);
  const topping = new InstancedMesh(new BoxGeometry(toppingWidth, toppingHeight, style.thickness * (posts ? 0.8 : 1)), material, maxSegments * TOPPINGS_PER_SEGMENT);
  for (const mesh of [wall, topping]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { wall, topping, half: 0.5 - style.thickness / 2, height: style.height, toppingHeight, segments: [] };
};

export const createFortPerimeterWallOverlay3D = (scene: Scene, maxSegments: number): FortPerimeterWallOverlay3D => {
  const tiers = new Map(VARIANTS.map((variant) => [variant, tierMeshes(scene, variant, maxSegments)] as const));
  let coverage: FortPerimeterCoverage | undefined;
  const matrix = new Matrix4();
  const rotateToZ = new Matrix4().makeRotationY(Math.PI / 2);
  const place = (mesh: InstancedMesh, index: number, x: number, y: number, z: number, alongZ: boolean): void => {
    if (alongZ) matrix.copy(rotateToZ).setPosition(x, y, z);
    else matrix.makeTranslation(x, y, z);
    mesh.setMatrixAt(index, matrix);
  };

  return {
    begin: (state) => {
      for (const tier of tiers.values()) tier.segments = [];
      coverage = fortPerimeterCoverage(state);
    },
    addTile: (tile, sceneX, sceneZ, surfaceY) => {
      if (!tile || !coverage || coverage.size === 0) return;
      const edges = fortPerimeterWallEdges(tile, coverage);
      if (!edges) return;
      const tier = tiers.get(edges.variant)!;
      if (tier.segments.length + 4 > maxSegments) return;
      const y = surfaceY + tier.height / 2;
      if (edges.north) tier.segments.push({ x: sceneX, y, z: sceneZ - tier.half, alongZ: false });
      if (edges.south) tier.segments.push({ x: sceneX, y, z: sceneZ + tier.half, alongZ: false });
      if (edges.west) tier.segments.push({ x: sceneX - tier.half, y, z: sceneZ, alongZ: true });
      if (edges.east) tier.segments.push({ x: sceneX + tier.half, y, z: sceneZ, alongZ: true });
    },
    commit: () => {
      for (const tier of tiers.values()) {
        tier.wall.count = tier.segments.length;
        tier.topping.count = tier.segments.length * TOPPINGS_PER_SEGMENT;
        tier.segments.forEach((segment, i) => {
          place(tier.wall, i, segment.x, segment.y, segment.z, segment.alongZ);
          const toppingY = segment.y + tier.height / 2 + tier.toppingHeight / 2;
          for (let k = 0; k < TOPPINGS_PER_SEGMENT; k += 1) {
            const along = (k + 0.5) / TOPPINGS_PER_SEGMENT - 0.5;
            const x = segment.alongZ ? segment.x : segment.x + along;
            const z = segment.alongZ ? segment.z + along : segment.z;
            place(tier.topping, i * TOPPINGS_PER_SEGMENT + k, x, toppingY, z, segment.alongZ);
          }
        });
        tier.wall.instanceMatrix.needsUpdate = true;
        tier.topping.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: () => {
      for (const tier of tiers.values()) {
        for (const mesh of [tier.wall, tier.topping]) {
          scene.remove(mesh);
          mesh.geometry.dispose();
        }
        (tier.wall.material as MeshStandardMaterial).dispose();
      }
    }
  };
};
