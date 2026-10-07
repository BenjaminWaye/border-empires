// Purely decorative rivers: a deterministic set of meandering polylines from
// a mountain down to the coast, rendered as a thin ribbon mesh laid over the
// existing heightfield. No gameplay, movement, or adjacency effect — this
// module reads world-gen state (terrainAt/landBiomeAt) but never writes
// anything, and nothing outside this file and its one wiring point in
// client-map-3d.ts knows rivers exist. Deleting both is a full revert.
import { BufferAttribute, BufferGeometry, type Material, Mesh, MeshStandardMaterial, Scene } from "three";
import {
  edgeRiversActive,
  isHillsTileAt,
  riverCornerWidthsForCurrentSeed,
  riversForCurrentSeed,
  smoothRiverPath,
  terrainAt,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type RiverPath,
  type RiverPoint
} from "@border-empires/shared";
import { wrap } from "../client-map-3d-heightfield-terrain.js";
import { kindAt, maxNearbyElevation } from "./client-map-3d-river-nearby-elevation.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import {
  appendWater,
  channelCenterline,
  heightfieldSurfaceY,
  indexCenterlines,
  RIVER_WATER_DEPTH,
  riverDescentScale,
  type ChannelPathPoint,
  type WaterBuffers,
  type WaterSides
} from "./client-map-3d-rivers-channel.js";
import { createRiverValley, type RiverValleyTile } from "./client-map-3d-river-valley.js";
import { createRiverWaterMaterial } from "./client-map-3d-river-water-material.js";
import { appendBank, createRiverBankMaterial } from "./client-map-3d-river-bank-strip.js";
import { riverMouthPlume, riverSampleSides, seaDirectionAtCorner, withMouthDescent } from "./client-map-3d-river-edge-water.js";
import type { Heightfield } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { heightfieldTileWindow, isInHeightfieldTileWindow, type HeightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";

export type { RiverPath, RiverPoint };
// Re-exported for the existing test suite (smoothRiverPath is exercised
// directly there) and any other client-side consumer that imported it from
// this module before path generation moved to @border-empires/shared.
export { smoothRiverPath, maxNearbyElevation };

// Lift above the real ground surface — same "surface lift to win the depth
// test against sloped terrain" technique as client-map-3d-contact-shadow.
const SURFACE_LIFT_Y = 0.025;
// How far above the sea surface the end of a v9 river mouth sits.
const MOUTH_LIFT_Y = 0.004;

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

export const createRiverOverlay = (scene: Scene, deps: RiverOverlayDeps): RiverOverlay => {
  const { heightfield } = deps;
  // v1-v8: flat strip through the tile centres, draped on the ground.
  const water = createRibbonLayer(createRiverWaterMaterial(false), RENDER_ORDER.riverWater);
  // v9: the river's own water material (RGBA vertex colours).
  const waterMaterial = createRiverWaterMaterial(true);
  // v9: carved valley terrain + real water.
  const valley = createRiverValley(scene, heightfield.material);
  // The mouth plume spills out over the sea, so it draws after the ocean
  // (RENDER_ORDER.riverMouth) and fades out. It must not write depth: the
  // ocean's animated surface dips below it in places, and a depth-writing
  // plume hid the ocean there and left a dark hole in the sea.
  const mouthMaterial = createRiverWaterMaterial(true);
  const bankMaterial = createRiverBankMaterial();
  mouthMaterial.depthWrite = false;
  let riverWaterMeshes: Mesh[] = [];
  const clearRiverWater = (): void => {
    for (const mesh of riverWaterMeshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    riverWaterMeshes = [];
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
    const isSeaAtScene = (x: number, z: number): boolean => {
      const terrain = terrainAt(wrap(camX + Math.floor(x), WORLD_WIDTH), wrap(camY + Math.floor(z), WORLD_HEIGHT));
      return terrain === "SEA" || terrain === "COASTAL_SEA";
    };
    const centerlines: ChannelPathPoint[][] = [];
    for (const path of riversForCurrentSeed()) {
      const first = path[0];
      if (!first) continue;
      const phase = (((first.wx * 12.9898 + first.wy * 78.233) % TAU) + TAU) % TAU;
      let run: ChannelPathPoint[] = [];
      let runStart = 0;
      let mouthCorner: { readonly x: number; readonly z: number } | null = null;
      const flush = (): void => {
        if (run.length >= 2) {
          const line = channelCenterline(run, phase, runStart === 0);
          const seaDir = mouthCorner && seaDirectionAtCorner(mouthCorner.x, mouthCorner.z);
          const end = line[line.length - 1]!;
          const before = line[line.length - 2]!;
          const tlen = Math.hypot(end.x - before.x, end.z - before.z) || 1;
          // The river's final corner touches the sea: cut down to sea level
          // over the last stretch, then spill out into it.
          if (seaDir) {
            const plume = riverMouthPlume(end, { x: (end.x - before.x) / tlen, z: (end.z - before.z) / tlen }, seaDir, isSeaAtScene).slice(1);
            centerlines.push([...withMouthDescent(line), ...plume.map((q) => ({ ...q, descent: 1 }))]);
          } else centerlines.push(line);
        }
        run = [];
        mouthCorner = null;
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
        if (i === path.length - 1) mouthCorner = { x: Math.round(p.wx), z: Math.round(p.wy) };
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
        // Same "hole" rule as the heightfield's coast skirt.
        const isHole = (hx: number, hz: number): boolean => {
          const terrain = terrainAt(wrap(hx, WORLD_WIDTH), wrap(hz, WORLD_HEIGHT));
          return terrain === "SEA" || terrain === "COASTAL_SEA" || !isExploredAt(wrap(hx, WORLD_WIDTH), wrap(hz, WORLD_HEIGHT));
        };
        const holeEdges = { top: isHole(wx, wz - 1), bottom: isHole(wx, wz + 1), left: isHole(wx - 1, wz), right: isHole(wx + 1, wz) };
        tiles.push({ sceneX: sx + dx, sceneZ: sz + dz, worldX: wx, worldZ: wz, worldX1: wrap(wx + 1, WORLD_WIDTH), worldZ1: wrap(wz + 1, WORLD_HEIGHT), holeEdges });
      }
    }
    valley.rebuild({
      tiles,
      camX,
      camY,
      // Mouth points run out over the sea: water only, never carved into
      // the coastal land tiles (their flared trench dug a hole in the coast).
      centerlines: indexCenterlines(centerlines.map((line) => line.filter((p) => !(p.mouth ?? 0)))),
      cornerYAt: heightfield.cornerYAt,
      cornerAttributesAt: heightfield.cornerAttributesAt
    });

    // Water: level across the channel at the trench's water line, never
    // below the sea's own surface (the river mouth meets the ocean flush).
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    // Over the sea the mouth sits just above the sea surface (it draws
    // after the ocean -- see mouthMaterial).
    // Near a mouth the channel is cut deeper (riverDescentScale), so the
    // water steps down to the sea with it.
    const waterYAt = (p: ChannelPathPoint): number => {
      const surface = heightfieldSurfaceY(p.x, p.z, camX, camY, heightfield.cornerYAt);
      const floor = WATER_SURFACE_Y + ((p.mouth ?? 0) > 0 ? MOUTH_LIFT_Y : 0);
      return Math.max(surface - RIVER_WATER_DEPTH * riverDescentScale(surface, p.descent ?? 0), floor);
    };
    const mouthBuffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    const bankBuffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    const surfaceAt = (x: number, z: number): number => heightfieldSurfaceY(x, z, camX, camY, heightfield.cornerYAt);
    for (const line of centerlines) {
      let run: ChannelPathPoint[] = [];
      let runSides: WaterSides[] = [];
      let mouthRun: ChannelPathPoint[] = [];
      let mouthSides: WaterSides[] = [];
      const flushWater = (): void => {
        appendWater(buffers, run, waterYAt, runSides);
        appendBank(bankBuffers, run, runSides, surfaceAt);
        appendWater(mouthBuffers, mouthRun, waterYAt, mouthSides);
        run = [];
        runSides = [];
        mouthRun = [];
        mouthSides = [];
      };
      line.forEach((p, i) => {
        const prev = line[Math.max(0, i - 1)]!;
        const next = line[Math.min(line.length - 1, i + 1)]!;
        const tlen = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
        const nx = -(next.z - prev.z) / tlen;
        const nz = (next.x - prev.x) / tlen;
        const explored = riverSampleSides(p.x, p.z, nx, nz, camX, camY, tileWindow, isExploredAt);
        // Plume water only ever lies over the sea, never over coastal land.
        const isPlume = (p.mouth ?? 0) > 0;
        const sides = isPlume
          ? { left: explored.left && isSeaAtScene(p.x - nx * 0.3, p.z - nz * 0.3), right: explored.right && isSeaAtScene(p.x + nx * 0.3, p.z + nz * 0.3) }
          : explored;
        if ((!sides.left && !sides.right) || (isPlume && !isSeaAtScene(p.x, p.z))) {
          flushWater();
          return;
        }
        if ((p.mouth ?? 0) > 0) {
          // The plume goes in its own mesh (see commitWater); its first
          // sample is the channel's last, so the two meet without a gap.
          if (mouthRun.length === 0 && run.length > 0) {
            mouthRun.push(run[run.length - 1]!);
            mouthSides.push(runSides[runSides.length - 1]!);
          }
          mouthRun.push(p);
          mouthSides.push(sides);
          return;
        }
        run.push(p);
        runSides.push(sides);
      });
      flushWater();
    }
    commitWater(bankBuffers, bankMaterial, RENDER_ORDER.riverBank);
    commitWater(buffers, waterMaterial, RENDER_ORDER.riverWater);
    commitWater(mouthBuffers, mouthMaterial, RENDER_ORDER.riverMouth);
  };

  const commitWater = (buffers: WaterBuffers, material: Material, renderOrder: number): void => {
    if (buffers.positions.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 4));
    geometry.setIndex(buffers.indices);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    riverWaterMeshes.push(mesh);
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
    mouthMaterial.dispose();
    bankMaterial.dispose();
    // The valley shares the heightfield's material -- disposed by its owner.
  };

  return { rebuild, dispose };
};
