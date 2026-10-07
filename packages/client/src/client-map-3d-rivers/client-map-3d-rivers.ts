// Purely decorative rivers: a deterministic set of meandering polylines from
// a mountain down to the coast, rendered as a thin ribbon mesh laid over the
// existing heightfield. No gameplay, movement, or adjacency effect — this
// module reads world-gen state (terrainAt/landBiomeAt) but never writes
// anything, and nothing outside this file and its one wiring point in
// client-map-3d.ts knows rivers exist. Deleting both is a full revert.
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
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
import { createRiverWaterMaterial } from "./client-map-3d-river-water-material.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { heightfieldTileWindow, isInHeightfieldTileWindow, type HeightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";

export type { RiverPath, RiverPoint };
// Re-exported for the existing test suite (smoothRiverPath is exercised
// directly there) and any other client-side consumer that imported it from
// this module before path generation moved to @border-empires/shared.
export { smoothRiverPath };

// Lift above the real ground surface — same "surface lift to win the depth
// test against sloped terrain" technique as client-map-3d-contact-shadow.
const SURFACE_LIFT_Y = 0.025;
// How far either side of a v9 centreline sample to look for "the tile on
// each side of the river" (the centreline hugs the tile border).
const RIVER_SIDE_PROBE = 0.3;

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

const createRibbonLayer = (material: MeshStandardMaterial, renderOrder: number): RibbonLayer => ({
  material,
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
  // surface and drawn with its terrain material; v1-v8 strips are draped
  // on that same surface.
  readonly heightfield: Pick<Heightfield, "cornerYAt" | "cornerAttributesAt" | "material">;
};

/**
 * v9 water culling: keep a centreline sample only when the tiles on *both*
 * sides of the river are explored and inside the heightfield's window.
 * Checking one tile let water hang over the unexplored void at the fog edge.
 */
export const isRiverSampleDrawable = (
  x: number,
  z: number,
  normalX: number,
  normalZ: number,
  camX: number,
  camY: number,
  tileWindow: HeightfieldTileWindow,
  isExploredAt: (wx: number, wy: number) => boolean
): boolean => {
  for (const side of [-RIVER_SIDE_PROBE, RIVER_SIDE_PROBE]) {
    const dx = Math.floor(x + normalX * side);
    const dz = Math.floor(z + normalZ * side);
    if (!isInHeightfieldTileWindow(tileWindow, dx, dz)) return false;
    if (!isExploredAt(wrap(camX + dx, WORLD_WIDTH), wrap(camY + dz, WORLD_HEIGHT))) return false;
  }
  return true;
};

export const createRiverOverlay = (scene: Scene, deps: RiverOverlayDeps): RiverOverlay => {
  const { heightfield } = deps;
  // v1-v8: flat strip through the tile centres, draped on the ground.
  const water = createRibbonLayer(createRiverWaterMaterial(false), RENDER_ORDER.riverWater);
  // v9: the river's own water material (RGBA vertex colours).
  const waterMaterial = createRiverWaterMaterial(true);
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

  // v1-v8 strip height: draped exactly on the rendered heightfield (it used
  // to float at the highest nearby tile's elevation -- maxNearbyElevation --
  // visibly hovering wherever the ground dipped). Hills tiles are a separate
  // dome mesh the heightfield doesn't know about, so they keep that bound.
  // Never below the sea surface, so the mouth meets the ocean flush.
  const surfaceYAt = (sceneX: number, sceneZ: number, camX: number, camY: number): number => {
    const wx = wrap(Math.floor(camX + sceneX), WORLD_WIDTH);
    const wy = wrap(Math.floor(camY + sceneZ), WORLD_HEIGHT);
    const ground = isHillsTileAt(wx, wy)
      ? maxNearbyElevation(wx, wy, kindAt)
      : heightfieldSurfaceY(sceneX, sceneZ, camX, camY, heightfield.cornerYAt);
    return Math.max(ground, WATER_SURFACE_Y) + SURFACE_LIFT_Y;
  };

  // v9: centrelines from runs of path points near the camera (camera-
  // relative coords wrap, so a whole path far across the world could jump
  // from +W/2 to -W/2 in one "segment"), then the carved valley under them
  // and the water in it.
  const rebuildEdgeRivers = (
    camX: number,
    camY: number,
    marginW: number,
    marginH: number,
    tileWindow: HeightfieldTileWindow,
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

    // Valley tiles: every explored land tile touching a river corner inside
    // the heightfield's own window -- exactly the tiles it leaves out for us.
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
        if (!isInHeightfieldTileWindow(tileWindow, sx + dx, sz + dz)) continue;
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
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    const waterYAt = (x: number, z: number): number =>
      Math.max(heightfieldSurfaceY(x, z, camX, camY, heightfield.cornerYAt) - RIVER_WATER_DEPTH, WATER_SURFACE_Y);
    for (const line of centerlines) {
      let run: ChannelPathPoint[] = [];
      line.forEach((p, i) => {
        const prev = line[Math.max(0, i - 1)]!;
        const next = line[Math.min(line.length - 1, i + 1)]!;
        const tlen = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
        const nx = -(next.z - prev.z) / tlen;
        const nz = (next.x - prev.x) / tlen;
        if (isRiverSampleDrawable(p.x, p.z, nx, nz, camX, camY, tileWindow, isExploredAt)) run.push(p);
        else {
          appendWater(buffers, run, waterYAt);
          run = [];
        }
      });
      appendWater(buffers, run, waterYAt);
    }
    if (buffers.positions.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 4));
    geometry.setIndex(buffers.indices);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, waterMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = RENDER_ORDER.riverWater; // above ownership fill, below fog-darken
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
      rebuildEdgeRivers(camX, camY, marginW, marginH, heightfieldTileWindow(halfW, halfH), isExploredAt);
      return;
    }

    type ScenePoint = { readonly x: number; readonly z: number; readonly halfWidth: number };
    type StripVertex = { readonly leftX: number; readonly leftZ: number; readonly rightX: number; readonly rightZ: number; readonly leftY: number; readonly rightY: number };

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
      const leftX = cur.x - px;
      const leftZ = cur.z - pz;
      const rightX = cur.x + px;
      const rightZ = cur.z + pz;
      return { leftX, leftZ, rightX, rightZ, leftY: surfaceYAt(leftX, leftZ, camX, camY), rightY: surfaceYAt(rightX, rightZ, camX, camY) };
    };

    // Sharing a vertex between consecutive segments (rather than each
    // segment owning independent corners, as before) is what removes the
    // gap/overlap at every bend, the same technique
    // client-map-3d-road-overlay.ts uses for road arms.
    const pushRibbonStrip = (run: readonly StripVertex[]): void => {
      if (run.length < 2) return;
      const base = water.positions.length / 3;
      for (const v of run) water.positions.push(v.leftX, v.leftY, v.leftZ, v.rightX, v.rightY, v.rightZ);
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
    waterMaterial.dispose();
    // The valley shares the heightfield's material -- disposed by its owner.
  };

  return { rebuild, dispose };
};
