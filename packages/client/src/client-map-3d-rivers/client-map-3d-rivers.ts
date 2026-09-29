// Purely decorative rivers: a deterministic set of meandering polylines from
// a mountain down to the coast, rendered as a thin ribbon mesh laid over the
// existing heightfield. No gameplay, movement, or adjacency effect — this
// module reads world-gen state (terrainAt/landBiomeAt) but never writes
// anything, and nothing outside this file and its one wiring point in
// client-map-3d.ts knows rivers exist. Deleting both is a full revert.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Material,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import {
  edgeRiversActive,
  isHillsTileAt,
  riverCornerWidthsForCurrentSeed,
  landBiomeAt,
  riversForCurrentSeed,
  smoothRiverPath,
  terrainAt,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type RiverPath,
  type RiverPoint
} from "@border-empires/shared";
import {
  heightfieldFlatTileElevation,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  wrap,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield-terrain.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import {
  appendWater,
  channelCenterline,
  heightfieldSurfaceY,
  indexCenterlines,
  RIVER_WATER_DEPTH,
  type ChannelPathPoint,
  type WaterBuffers
} from "./client-map-3d-rivers-channel.js";
import { createRiverValley, type RiverValleyTile } from "./client-map-3d-river-valley.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { UV_WORLD_SCALE, WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";

export type { RiverPath, RiverPoint };
// Re-exported for the existing test suite (smoothRiverPath is exercised
// directly there) and any other client-side consumer that imported it from
// this module before path generation moved to @border-empires/shared.
export { smoothRiverPath };

// Lift above the real ground surface — same "surface lift to win the depth
// test against sloped terrain" technique as client-map-3d-contact-shadow.
const SURFACE_LIFT_Y = 0.025;
// Visual family with the ocean (client-map-3d-water-surface.ts's
// DEEP_COLOR/SHALLOW_COLOR) without importing that module's heavier
// dual-normal-map material — a thin land ribbon at close camera range
// doesn't need the ocean's animated chop.
const RIVER_COLOR = new Color(0x3f7fa0);

const kindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
  const terrain = terrainAt(wx, wy);
  if (terrain === "SEA") return "SEA";
  if (terrain === "COASTAL_SEA") return "COASTAL_SEA";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = landBiomeAt(wx, wy);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  if (biome === "TUNDRA") return "TUNDRA";
  return "GRASS";
};

// The real heightfield renders each *corner* as an average of its 4
// surrounding tiles' elevations (client-map-3d-heightfield.ts), not a
// single tile's own value — so a point sitting one tile from a MOUNTAIN
// (elevation ~1.15, vs. ~0.07-0.20 for flat land) can have a real rendered
// ground surface well above what heightfieldFlatTileElevation reports for
// its own tile alone. Taking the max elevation over the tile and its 8
// neighbours is a safe upper bound for any corner blend touching this point
// — corner averaging can never exceed the highest contributing tile.
// Exported (rather than a private closure) so this can be tested with a
// synthetic tileKindAt, the same injection pattern client-map-3d-heightfield
// tests already use, instead of needing real world-gen state.
export const maxNearbyElevation = (
  wx: number,
  wy: number,
  tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind,
  // Hills are a dome mesh bolted on top of the flat grid (see
  // client-map-3d-hills.ts), invisible to heightfieldFlatTileElevation —
  // without this bonus the river ribbon renders under the dome bulge
  // wherever its path crosses a hills tile. Injectable (like tileKindAt
  // above) so this stays testable with synthetic tile state instead of
  // needing real world-gen.
  isHillsAt: (wx: number, wy: number) => boolean = isHillsTileAt
): number => {
  const tx = Math.floor(wx);
  const ty = Math.floor(wy);
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = wrap(tx + dx, WORLD_WIDTH);
      const ny = wrap(ty + dy, WORLD_HEIGHT);
      const kind = tileKindAt(nx, ny);
      if (kind === "SEA" || kind === "COASTAL_SEA") continue;
      const elevation =
        heightfieldFlatTileElevation(nx, ny, kind) + (isHillsAt(nx, ny) ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0);
      if (elevation > maxElevation) maxElevation = elevation;
    }
  }
  return maxElevation;
};

export type RiverOverlayRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  // Same explored/fogged predicate the heightfield uses (client-map-3d.ts's
  // isExploredForHeightfield) — without it river segments drew straight
  // through unexplored fog since this overlay only ever culled by camera
  // distance, never by what the player has actually seen.
  readonly isExploredAt: (wx: number, wy: number) => boolean;
};

export type RiverOverlay = {
  readonly rebuild: (inputs: RiverOverlayRebuildInputs) => void;
  readonly dispose: () => void;
};

type RibbonLayer = {
  readonly material: MeshStandardMaterial;
  readonly renderOrder: number;
  mesh: Mesh | null;
  geometry: BufferGeometry | null;
  positions: number[];
  indices: number[];
};

const createRibbonLayer = (color: Color, opacity: number, roughness: number, renderOrder: number): RibbonLayer => ({
  material: new MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.0,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: DoubleSide
  }),
  renderOrder,
  mesh: null,
  geometry: null,
  positions: [],
  indices: []
});

const clearRibbonLayer = (scene: Scene, layer: RibbonLayer): void => {
  if (layer.mesh) scene.remove(layer.mesh);
  layer.geometry?.dispose();
  layer.mesh = null;
  layer.geometry = null;
  layer.positions = [];
  layer.indices = [];
};

const commitRibbonLayer = (scene: Scene, layer: RibbonLayer): void => {
  if (layer.positions.length === 0) return;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(layer.positions), 3));
  geometry.setIndex(layer.indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, layer.material);
  mesh.frustumCulled = false;
  mesh.renderOrder = layer.renderOrder;
  scene.add(mesh);
  layer.geometry = geometry;
  layer.mesh = mesh;
};

const TAU = Math.PI * 2;

export type RiverOverlayDeps = {
  // v9 rivers carve a valley mesh matched to the heightfield's rendered
  // surface and drawn with its terrain material.
  readonly heightfield: Pick<Heightfield, "cornerYAt" | "cornerAttributesAt" | "material">;
  // v9 river water uses the ocean's animated material
  // (client-map-3d-water-surface.ts), so it ripples and shines like the sea.
  readonly waterMaterial: Material;
};

export const createRiverOverlay = (scene: Scene, deps: RiverOverlayDeps): RiverOverlay => {
  const { heightfield, waterMaterial } = deps;
  // v1-v8: the original flat ribbon floated over the tile centres.
  const water = createRibbonLayer(RIVER_COLOR, 0.82, 0.32, 5);
  // v9: carved valley terrain + real water.
  const valley = createRiverValley(scene, heightfield.material);
  let riverWaterMesh: Mesh | null = null;
  let riverWaterGeometry: BufferGeometry | null = null;
  const clearRiverWater = (): void => {
    if (riverWaterMesh) scene.remove(riverWaterMesh);
    riverWaterGeometry?.dispose();
    riverWaterMesh = null;
    riverWaterGeometry = null;
  };

  // Without accounting for nearby terrain (see maxNearbyElevation above),
  // the ribbon rendered underground for a stretch near every mountain
  // source, reading as the river getting "cut off" right where it should
  // visibly begin.
  const surfaceYAt = (wx: number, wy: number): number => maxNearbyElevation(wx, wy, kindAt) + SURFACE_LIFT_Y;

  // v9: centrelines from runs of path points near the camera (camera-
  // relative coords wrap, so a whole path far across the world could jump
  // from +W/2 to -W/2 in one "segment"), then the carved valley under them
  // and the water in it.
  const rebuildEdgeRivers = (
    camX: number,
    camY: number,
    marginW: number,
    marginH: number,
    isExploredAt: (wx: number, wy: number) => boolean
  ): void => {
    const reachW = marginW + 2;
    const reachH = marginH + 2;
    const centerlines: ChannelPathPoint[][] = [];
    for (const path of riversForCurrentSeed()) {
      const first = path[0];
      if (!first) continue;
      const phase = (((first.wx * 12.9898 + first.wy * 78.233) % TAU) + TAU) % TAU;
      let run: ChannelPathPoint[] = [];
      let runStart = 0;
      const flush = (): void => {
        if (run.length >= 2) centerlines.push(channelCenterline(run, phase, runStart === 0));
        run = [];
      };
      path.forEach((p, i) => {
        const x = toroidDelta(camX, p.wx, WORLD_WIDTH);
        const z = toroidDelta(camY, p.wy, WORLD_HEIGHT);
        if (Math.abs(x) > reachW || Math.abs(z) > reachH) {
          flush();
          return;
        }
        if (run.length === 0) runStart = i;
        run.push({ x, z, halfWidth: p.halfWidth });
      });
      flush();
    }
    if (centerlines.length === 0) return;

    // Valley tiles: every explored land tile touching a river corner in view
    // -- exactly the tiles the heightfield leaves out for us.
    const tiles: RiverValleyTile[] = [];
    const seen = new Set<number>();
    for (const cornerIndex of riverCornerWidthsForCurrentSeed().keys()) {
      const cx = cornerIndex % WORLD_WIDTH;
      const cz = Math.floor(cornerIndex / WORLD_WIDTH);
      const sx = toroidDelta(camX, cx, WORLD_WIDTH);
      const sz = toroidDelta(camY, cz, WORLD_HEIGHT);
      if (Math.abs(sx) > reachW || Math.abs(sz) > reachH) continue;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const wx = wrap(cx + dx, WORLD_WIDTH);
        const wz = wrap(cz + dz, WORLD_HEIGHT);
        const key = wz * WORLD_WIDTH + wx;
        if (seen.has(key)) continue;
        seen.add(key);
        if (terrainAt(wx, wz) !== "LAND" || !isExploredAt(wx, wz)) continue;
        tiles.push({ sceneX: sx + dx, sceneZ: sz + dz, worldX: wx, worldZ: wz, worldX1: wrap(wx + 1, WORLD_WIDTH), worldZ1: wrap(wz + 1, WORLD_HEIGHT) });
      }
    }
    valley.rebuild({
      tiles,
      camX,
      camY,
      centerlines: indexCenterlines(centerlines),
      cornerYAt: heightfield.cornerYAt,
      cornerAttributesAt: heightfield.cornerAttributesAt
    });

    // Water: level across the channel at the trench's water line, never
    // below the sea's own surface (the river mouth meets the ocean flush).
    const buffers: WaterBuffers = { positions: [], colors: [], uvs: [], indices: [] };
    const waterYAt = (x: number, z: number): number =>
      Math.max(heightfieldSurfaceY(x, z, camX, camY, heightfield.cornerYAt) - RIVER_WATER_DEPTH, WATER_SURFACE_Y);
    const uvAt = (x: number, z: number): readonly [number, number] => [x / UV_WORLD_SCALE, z / UV_WORLD_SCALE];
    for (const line of centerlines) {
      let run: ChannelPathPoint[] = [];
      for (const p of line) {
        const visible = Math.abs(p.x) <= marginW && Math.abs(p.z) <= marginH && isExploredAt(wrap(Math.floor(camX + p.x), WORLD_WIDTH), wrap(Math.floor(camY + p.z), WORLD_HEIGHT));
        if (visible) run.push(p);
        else {
          appendWater(buffers, run, waterYAt, uvAt);
          run = [];
        }
      }
      appendWater(buffers, run, waterYAt, uvAt);
    }
    if (buffers.positions.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(buffers.uvs), 2));
    geometry.setIndex(buffers.indices);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, waterMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12; // same as the ocean surface
    scene.add(mesh);
    riverWaterGeometry = geometry;
    riverWaterMesh = mesh;
  };

  const rebuild = (inputs: RiverOverlayRebuildInputs): void => {
    clearRibbonLayer(scene, water);
    clearRiverWater();
    valley.dispose();

    const { camX, camY, halfW, halfH, isExploredAt } = inputs;
    const marginW = halfW + 2;
    const marginH = halfH + 2;
    const rivers = riversForCurrentSeed();

    // A point renders if it (or an immediate neighbour) is within the view
    // margin — mirroring the old per-*segment* rule, which kept a segment
    // as long as at least one of its two endpoints was inside. Checking
    // only the point itself would clip a couple of tiles earlier than
    // before right at the edge of the camera window. Fog-of-war has no
    // such leniency: an unexplored point is a hard cut, same as before.
    const keepMask = (path: RiverPath, scene: ReadonlyArray<{ readonly x: number; readonly z: number }>): boolean[] => {
      const inView = scene.map((p) => Math.abs(p.x) <= marginW && Math.abs(p.z) <= marginH);
      return path.map((p, i) =>
        (inView[i] || (i > 0 && inView[i - 1]) || (i < path.length - 1 && inView[i + 1])) === true &&
        isExploredAt(Math.floor(p.wx), Math.floor(p.wy))
      );
    };

    if (edgeRiversActive()) {
      rebuildEdgeRivers(camX, camY, marginW, marginH, isExploredAt);
      return;
    }

    type ScenePoint = { readonly x: number; readonly z: number; readonly y: number; readonly halfWidth: number };
    type StripVertex = { readonly leftX: number; readonly leftZ: number; readonly rightX: number; readonly rightZ: number; readonly y: number };

    // Left/right offsets are computed from the *full* path's neighbours
    // before any view/fog culling, not from a run truncated by that culling.
    // Deriving the tangent from a run-local neighbour instead would make the
    // ribbon's end cap snap to a one-sided (and often wrong) direction right
    // at every camera-margin or fog boundary, since that boundary is a
    // rendering artifact, not a real bend in the river.
    const vertexAt = (points: readonly ScenePoint[], i: number): StripVertex => {
      const prev = points[Math.max(i - 1, 0)]!;
      const next = points[Math.min(i + 1, points.length - 1)]!;
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tlen = Math.hypot(tx, tz) || 1;
      const cur = points[i]!;
      const px = (-tz / tlen) * cur.halfWidth;
      const pz = (tx / tlen) * cur.halfWidth;
      return { leftX: cur.x - px, leftZ: cur.z - pz, rightX: cur.x + px, rightZ: cur.z + pz, y: cur.y };
    };

    // Sharing a vertex between consecutive segments (rather than each
    // segment owning independent corners, as before) is what removes the
    // gap/overlap at every bend, the same technique
    // client-map-3d-road-overlay.ts uses for road arms.
    const pushRibbonStrip = (run: readonly StripVertex[]): void => {
      if (run.length < 2) return;
      const base = water.positions.length / 3;
      for (const v of run) water.positions.push(v.leftX, v.y, v.leftZ, v.rightX, v.y, v.rightZ);
      for (let i = 0; i < run.length - 1; i += 1) {
        const li = base + i * 2;
        const ri = li + 1;
        const li1 = li + 2;
        const ri1 = li + 3;
        water.indices.push(li, li1, ri, ri, li1, ri1);
      }
    };

    for (const path of rivers) {
      const scenePoints = path.map((p) => ({
        x: toroidDelta(camX, p.wx, WORLD_WIDTH),
        z: toroidDelta(camY, p.wy, WORLD_HEIGHT),
        y: surfaceYAt(p.wx, p.wy),
        halfWidth: p.halfWidth
      }));
      const keep = keepMask(path, scenePoints);
      let run: StripVertex[] = [];
      for (let i = 0; i < scenePoints.length; i += 1) {
        if (!keep[i]) {
          pushRibbonStrip(run);
          run = [];
          continue;
        }
        run.push(vertexAt(scenePoints, i));
      }
      pushRibbonStrip(run);
    }

    commitRibbonLayer(scene, water);
  };

  const dispose = (): void => {
    clearRibbonLayer(scene, water);
    clearRiverWater();
    valley.dispose();
    water.material.dispose();
    // waterMaterial belongs to the ocean surface and the valley shares the
    // heightfield's material -- both are disposed by their owners.
  };

  return { rebuild, dispose };
};
