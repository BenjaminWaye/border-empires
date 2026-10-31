import {
  BufferAttribute,
  type BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  type Scene,
  Shape,
  ShapeGeometry,
  Vector3
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { landingAshoreDirection } from "../client-dock-landing-ground/client-dock-landing-ground.js";
import { tileCornerMeanY } from "../client-map-3d-beacon-placement-overlay/client-map-3d-beacon-placement-overlay.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import type { SelectionRangeOverlaysDeps } from "../client-map-3d-selection-range-overlays/client-map-3d-selection-range-overlays.js";

// One landing-ground look for the true-3D map: per tile, a soft fill, a
// bright square edge and two chevrons sliding ashore from the water side, so
// every tile a crossing can land on -- the dock and the beaches beside it --
// reads as a landing spot, not just a tint. A glow band lies on the water off
// every side of the tile that faces the sea, so the strip of shore a crossing
// can reach reads as one landing beach. The 2D
// counterpart draws the same edge, waterline and a chevron
// (client-dock-landing-ground-2d.ts).

const CHEVRONS_PER_TILE = 2;
// One chevron's trip from the seaward edge to the tile centre.
const CHEVRON_PERIOD_MS = 1_600;
const CHEVRON_TRAVEL = 0.34;
const EDGE_PULSE_PERIOD_MS = 2_400;
// How far the waterline glow reaches out to sea, in tiles.
const WATERLINE_REACH = 0.42;
const WATER_SIDES: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export type LandingMarkerLook = {
  readonly color: string;
  readonly fillOpacity: number;
  readonly edgeOpacity: number;
  readonly chevronOpacity: number;
  readonly waterlineOpacity: number;
  readonly rise: number;
  readonly renderOrder: number;
};

export type LandingMarkerLayer = {
  readonly fill: (deps: SelectionRangeOverlaysDeps, keys: Iterable<string>, nowMs: number) => void;
  readonly dispose: () => void;
};

// A V pointing +Y in shape space; rotateX(+pi/2) lays it flat pointing +Z (south).
const chevronGeometry = (): BufferGeometry => {
  const shape = new Shape();
  shape.moveTo(-0.3, -0.06);
  shape.lineTo(0, 0.16);
  shape.lineTo(0.3, -0.06);
  shape.lineTo(0.3, -0.19);
  shape.lineTo(0, 0.03);
  shape.lineTo(-0.3, -0.19);
  shape.closePath();
  return new ShapeGeometry(shape).rotateX(Math.PI / 2);
};

// Square ring: RingGeometry with 4 segments starting at 45 degrees has its corners on the diagonals.
const edgeGeometry = (): BufferGeometry => new RingGeometry(0.36 * Math.SQRT2, 0.48 * Math.SQRT2, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);

// A flat glow band lying on the water off a tile's +Z (south) edge: opaque at
// the shore and fading out to sea (per-vertex alpha); rotated onto each water
// side. Flat rather than upright so it reads at any camera heading.
const waterlineGeometry = (): BufferGeometry => {
  const geometry = new PlaneGeometry(1, WATERLINE_REACH).rotateX(-Math.PI / 2).translate(0, 0, 0.48 + WATERLINE_REACH / 2);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i += 1) {
    colors.set([1, 1, 1, positions.getZ(i) > 0.48 + WATERLINE_REACH / 2 ? 0 : 1], i * 4);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 4));
  return geometry;
};

const makeMesh = (scene: Scene, geometry: BufferGeometry, color: string, opacity: number, capacity: number, renderOrder: number, vertexAlpha = false) => {
  const material = new MeshBasicMaterial({
    toneMapped: false, color, transparent: true, opacity, depthTest: false, depthWrite: false, side: DoubleSide, vertexColors: vertexAlpha
  });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, material, geometry };
};

const finish = (mesh: InstancedMesh, count: number): void => {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count === 0) return;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
};

export const createLandingMarkerLayer = (scene: Scene, look: LandingMarkerLook, capacity: number): LandingMarkerLayer => {
  const fillPart = makeMesh(scene, new PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2), look.color, look.fillOpacity, capacity, look.renderOrder);
  const edgePart = makeMesh(scene, edgeGeometry(), look.color, look.edgeOpacity, capacity, look.renderOrder + 1);
  const waterlinePart = makeMesh(scene, waterlineGeometry(), look.color, look.waterlineOpacity, capacity * WATER_SIDES.length, look.renderOrder + 1, true);
  const chevronPart = makeMesh(scene, chevronGeometry(), look.color, look.chevronOpacity, capacity * CHEVRONS_PER_TILE, look.renderOrder + 2);
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);

  const fill = (deps: SelectionRangeOverlaysDeps, keys: Iterable<string>, nowMs: number): void => {
    let tiles = 0;
    let chevrons = 0;
    let waterlines = 0;
    for (const key of keys) {
      if (tiles >= capacity) break;
      const [wx, wy] = key.split(",").map(Number) as [number, number];
      if (deps.tileVisibilityStateAt(wx, wy, deps.state.tiles.get(key)) === "unexplored") continue;
      const centerX = toroidDelta(deps.sceneOrigin.camX, wx, WORLD_WIDTH) + 0.5;
      const centerZ = toroidDelta(deps.sceneOrigin.camY, wy, WORLD_HEIGHT) + 0.5;
      const surfaceY = tileCornerMeanY(deps.cornerYAt, wx, wy) + look.rise;
      matrix.makeTranslation(centerX, surfaceY, centerZ);
      fillPart.mesh.setMatrixAt(tiles, matrix);
      edgePart.mesh.setMatrixAt(tiles, matrix);
      tiles += 1;

      for (const [ox, oy] of WATER_SIDES) {
        const terrain = deps.state.tiles.get(`${deps.wrapX(wx + ox)},${deps.wrapY(wy + oy)}`)?.terrain;
        if (terrain !== "SEA" && terrain !== "COASTAL_SEA") continue;
        rotation.setFromAxisAngle(up, Math.atan2(ox, oy));
        position.set(centerX, surfaceY, centerZ);
        matrix.compose(position, rotation, scale.set(1, 1, 1));
        waterlinePart.mesh.setMatrixAt(waterlines, matrix);
        waterlines += 1;
      }

      const ashore = landingAshoreDirection(deps.state.tiles, wx, wy);
      rotation.setFromAxisAngle(up, Math.atan2(ashore.dx, ashore.dy));
      for (let i = 0; i < CHEVRONS_PER_TILE; i += 1) {
        const phase = ((nowMs / CHEVRON_PERIOD_MS + i / CHEVRONS_PER_TILE) % 1 + 1) % 1;
        // Start at the seaward edge, end at the centre, growing in and shrinking out.
        const along = -CHEVRON_TRAVEL + phase * CHEVRON_TRAVEL;
        const size = 0.35 + 0.65 * Math.sin(Math.PI * phase);
        position.set(centerX + ashore.dx * along, surfaceY + 0.002, centerZ + ashore.dy * along);
        scale.set(size, 1, size);
        matrix.compose(position, rotation, scale);
        chevronPart.mesh.setMatrixAt(chevrons, matrix);
        chevrons += 1;
      }
    }
    edgePart.material.opacity = look.edgeOpacity * (0.75 + 0.25 * Math.sin((2 * Math.PI * nowMs) / EDGE_PULSE_PERIOD_MS));
    finish(fillPart.mesh, tiles);
    finish(edgePart.mesh, tiles);
    finish(waterlinePart.mesh, waterlines);
    finish(chevronPart.mesh, chevrons);
  };

  const dispose = (): void => {
    for (const part of [fillPart, edgePart, waterlinePart, chevronPart]) {
      scene.remove(part.mesh);
      part.geometry.dispose();
      part.material.dispose();
    }
  };

  return { fill, dispose };
};
