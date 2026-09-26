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
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import {
  edgeRiversActive,
  isHillsTileAt,
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
// v9 edge rivers: the water sits just above the *carved* corner surface
// (client-map-3d-heightfield-corners.ts pulls river corners down), so it
// reads as water in a channel below the banks, not a ribbon on top of them.
const CHANNEL_WATER_LIFT_Y = 0.012;

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

// v9 only: a wider, dark, earthy band under the water ribbon. From the usual
// top-down camera the carved slope alone barely reads (it spreads across a
// whole tile), so this cut-bank band is what makes the river look sunk into
// the ground at the tile border rather than painted on top of it.
const BANK_COLOR = new Color(0x3b3524);
const BANK_EXTRA_HALF_WIDTH = 0.09;
const BANK_BELOW_WATER_Y = 0.004;

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

export const createRiverOverlay = (
  scene: Scene,
  // The heightfield's rendered corner Y (client-map-3d-heightfield.ts). v9
  // river points are exact grid corners, so this is the carved channel floor.
  cornerYAt: (cornerX: number, cornerZ: number) => number
): RiverOverlay => {
  const water = createRibbonLayer(RIVER_COLOR, 0.82, 0.32, 5);
  const bank = createRibbonLayer(BANK_COLOR, 0.6, 1, 4);

  // Without accounting for nearby terrain (see maxNearbyElevation above),
  // the ribbon rendered underground for a stretch near every mountain
  // source, reading as the river getting "cut off" right where it should
  // visibly begin.
  const surfaceYAt = (wx: number, wy: number): number => maxNearbyElevation(wx, wy, kindAt) + SURFACE_LIFT_Y;
  const channelYAt = (wx: number, wy: number): number => cornerYAt(wx, wy) + CHANNEL_WATER_LIFT_Y;

  const rebuild = (inputs: RiverOverlayRebuildInputs): void => {
    clearRibbonLayer(scene, water);
    clearRibbonLayer(scene, bank);

    const { camX, camY, halfW, halfH, isExploredAt } = inputs;
    const marginW = halfW + 2;
    const marginH = halfH + 2;
    const rivers = riversForCurrentSeed();
    const edgeRivers = edgeRiversActive();
    const riverYAt = edgeRivers ? channelYAt : surfaceYAt;

    type ScenePoint = { readonly x: number; readonly z: number; readonly y: number; readonly halfWidth: number };
    type StripVertex = { readonly leftX: number; readonly leftZ: number; readonly rightX: number; readonly rightZ: number; readonly y: number };

    // Left/right offsets are computed from the *full* path's neighbours
    // before any view/fog culling, not from a run truncated by that culling.
    // Deriving the tangent from a run-local neighbour instead would make the
    // ribbon's end cap snap to a one-sided (and often wrong) direction right
    // at every camera-margin or fog boundary, since that boundary is a
    // rendering artifact, not a real bend in the river.
    const vertexAt = (points: readonly ScenePoint[], i: number, extraHalfWidth: number, dy: number): StripVertex => {
      const prev = points[Math.max(i - 1, 0)]!;
      const next = points[Math.min(i + 1, points.length - 1)]!;
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tlen = Math.hypot(tx, tz) || 1;
      const cur = points[i]!;
      const halfWidth = cur.halfWidth + extraHalfWidth;
      const px = (-tz / tlen) * halfWidth;
      const pz = (tx / tlen) * halfWidth;
      return { leftX: cur.x - px, leftZ: cur.z - pz, rightX: cur.x + px, rightZ: cur.z + pz, y: cur.y + dy };
    };

    // Sharing a vertex between consecutive segments (rather than each
    // segment owning independent corners, as before) is what removes the
    // gap/overlap at every bend, the same technique
    // client-map-3d-road-overlay.ts uses for road arms.
    const pushRibbonStrip = (layer: RibbonLayer, run: readonly StripVertex[]): void => {
      if (run.length < 2) return;
      const base = layer.positions.length / 3;
      for (const v of run) layer.positions.push(v.leftX, v.y, v.leftZ, v.rightX, v.y, v.rightZ);
      for (let i = 0; i < run.length - 1; i += 1) {
        const li = base + i * 2;
        const ri = li + 1;
        const li1 = li + 2;
        const ri1 = li + 3;
        layer.indices.push(li, li1, ri, ri, li1, ri1);
      }
    };

    for (const path of rivers) {
      const scenePoints = path.map((p) => ({
        x: toroidDelta(camX, p.wx, WORLD_WIDTH),
        z: toroidDelta(camY, p.wy, WORLD_HEIGHT),
        y: riverYAt(p.wx, p.wy),
        halfWidth: p.halfWidth
      }));
      const inView = scenePoints.map((p) => Math.abs(p.x) <= marginW && Math.abs(p.z) <= marginH);
      const explored = path.map((p) => isExploredAt(Math.floor(p.wx), Math.floor(p.wy)));
      // A point renders if it (or an immediate neighbour) is within the view
      // margin — mirroring the old per-*segment* rule, which kept a segment
      // as long as at least one of its two endpoints was inside. Checking
      // only the point itself would clip a couple of tiles earlier than
      // before right at the edge of the camera window. Fog-of-war has no
      // such leniency: an unexplored point is a hard cut, same as before.
      let run: StripVertex[] = [];
      let bankRun: StripVertex[] = [];
      const flush = (): void => {
        pushRibbonStrip(water, run);
        if (edgeRivers) pushRibbonStrip(bank, bankRun);
        run = [];
        bankRun = [];
      };
      for (let i = 0; i < scenePoints.length; i += 1) {
        const keepForView = inView[i] || (i > 0 && inView[i - 1]) || (i < scenePoints.length - 1 && inView[i + 1]);
        if (!keepForView || !explored[i]) {
          flush();
          continue;
        }
        run.push(vertexAt(scenePoints, i, 0, 0));
        if (edgeRivers) bankRun.push(vertexAt(scenePoints, i, BANK_EXTRA_HALF_WIDTH, -BANK_BELOW_WATER_Y));
      }
      flush();
    }

    // Water first so it's the scene's first river mesh (tests look it up that way).
    commitRibbonLayer(scene, water);
    commitRibbonLayer(scene, bank);
  };

  const dispose = (): void => {
    clearRibbonLayer(scene, water);
    clearRibbonLayer(scene, bank);
    water.material.dispose();
    bank.material.dispose();
  };

  return { rebuild, dispose };
};
