// Map names painted onto the 3D ground, like a cartographer's ink on a
// campaign map: player names across their garrisoned land when zoomed out,
// island names when zoomed in (labels and lettering from
// client-map-name-labels/, the same layout the 2D map draws).
//
// How: the names are drawn into a world-aligned canvas (a few pixels per
// tile) covering the camera window plus a margin, and that canvas is laid on
// a mesh that follows the rendered ground -- tile corners from the
// heightfield, tile centres from the hill dome (flatOverlayY) -- just above
// the ownership tint. It depth-tests, so towns, forts, units and every
// overlay drawn later stand in front of the lettering, and fog / storm
// clouds (higher render orders) still cover it.
//
// Cost: the canvas is only redrawn (and re-uploaded) when the labels change
// or the camera leaves the canvas's area; the ground mesh is rebuilt when the
// camera window moves by a tile or the terrain under it changes.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  type Scene
} from "three";
import { drawNameAlongPath } from "../client-map-name-labels/client-map-name-label-draw.js";
import { createMapNameLabelSource, type MapNameLabelSource, type MapNameLabelSourceDeps } from "../client-map-name-labels/client-map-name-labels.js";
import type { RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { tileSurfaceHeights, type TileSurfaceHeightfield } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";

/** Tiles of canvas kept around the camera window, so small pans don't redraw the texture. */
const CANVAS_MARGIN_TILES = 12;
/** Hard cap on either canvas dimension; pixels per tile shrink to stay under it. */
const MAX_CANVAS_PX = 2048;
const MAX_PX_PER_TILE = 40;
/** Corner lift above the heightfield; matches client-map-3d.ts's OVERLAY_RISE_ABOVE_HEIGHTFIELD. */
const CORNER_RISE = 0.012;
/** Ground-mesh vertices per tile edge (corners, edge midpoints, centres). */
const SUBDIVISIONS = 2;
const TERRAIN_RESAMPLE_MIN_INTERVAL_MS = 1_000;
/** Smallest glyph height, in tiles, before a name stops shrinking to fit. */
const MIN_GLYPH_TILES = 0.3;

export type NameDecalDeps = {
  readonly scene: Scene;
  readonly source: MapNameLabelSource;
  /** Rendered heightfield corner height (world corner coordinates). */
  readonly cornerYAt: (wx: number, wy: number) => number;
  /** Rendered height of a tile's centre, overlay lift included (tileSurfaceHeights' flatOverlayY). */
  readonly tileCenterY: (wx: number, wy: number) => number;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly worldWidth: number;
  readonly worldHeight: number;
};

export type NameDecalFrame = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly nowMs: number;
  /** Bumps when terrain under the window may have changed (new tiles explored, mountains). */
  readonly terrainRevision: number;
};

export type NameDecal = {
  /** From the terrain rebuild: the camera window the ground was just built for. */
  readonly sync: (frame: NameDecalFrame) => void;
  /** Every animation frame: picks up label changes (zoom crossfade, renames) between terrain rebuilds. */
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

const toroidDelta = (from: number, to: number, size: number): number => {
  let delta = (to - from) % size;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
};

type CanvasArea = { x0: number; y0: number; widthTiles: number; heightTiles: number; pxPerTile: number };

export const createNameDecal = (deps: NameDecalDeps): NameDecal => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8; // the ground is seen at a slant; keeps far lettering crisp
  const material = new MeshBasicMaterial({
    toneMapped: false,
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.groundNames;
  mesh.visible = false;
  deps.scene.add(mesh);

  let area: CanvasArea | undefined;
  let drawnSignature = "";
  let meshKey = "";
  let hasInk = false;
  let meshTerrainRevision = -1;
  let meshBuiltAt = Number.NEGATIVE_INFINITY;

  // The canvas never spans more than half the world in either direction: past
  // that, toroidal deltas fold and the texture would smear. A camera window
  // wider than that just leaves its far edges unlettered.
  const maxHalfW = Math.floor(deps.worldWidth / 4) - 1;
  const maxHalfH = Math.floor(deps.worldHeight / 4) - 1;
  const neededHalfW = (frame: NameDecalFrame): number => Math.min(frame.halfW + 2, maxHalfW);
  const neededHalfH = (frame: NameDecalFrame): number => Math.min(frame.halfH + 2, maxHalfH);

  const areaCovers = (current: CanvasArea, frame: NameDecalFrame): boolean => {
    const dx = toroidDelta(current.x0 + current.widthTiles / 2, frame.camX, deps.worldWidth);
    const dy = toroidDelta(current.y0 + current.heightTiles / 2, frame.camY, deps.worldHeight);
    const wantW = Math.min(neededHalfW(frame) + CANVAS_MARGIN_TILES, maxHalfW);
    const wantH = Math.min(neededHalfH(frame) + CANVAS_MARGIN_TILES, maxHalfH);
    // Covers the window (with no margin left is fine), and isn't far bigger than a fresh placement would be.
    return Math.abs(dx) + neededHalfW(frame) <= current.widthTiles / 2 && Math.abs(dy) + neededHalfH(frame) <= current.heightTiles / 2 && current.widthTiles <= 2 * wantW + 2 && current.heightTiles <= 2 * wantH + 2;
  };

  const placeArea = (frame: NameDecalFrame): CanvasArea => {
    const widthTiles = 2 * Math.min(neededHalfW(frame) + CANVAS_MARGIN_TILES, maxHalfW);
    const heightTiles = 2 * Math.min(neededHalfH(frame) + CANVAS_MARGIN_TILES, maxHalfH);
    const pxPerTile = Math.max(2, Math.min(MAX_PX_PER_TILE, Math.floor(MAX_CANVAS_PX / Math.max(widthTiles, heightTiles))));
    return { x0: deps.wrapX(frame.camX - widthTiles / 2), y0: deps.wrapY(frame.camY - heightTiles / 2), widthTiles, heightTiles, pxPerTile };
  };

  const redraw = (current: CanvasArea, labels: ReturnType<MapNameLabelSource["current"]>["labels"]): boolean => {
    const width = current.widthTiles * current.pxPerTile;
    const height = current.heightTiles * current.pxPerTile;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (!ctx) return false;
    ctx.clearRect(0, 0, width, height);
    const project = (wx: number, wy: number): { sx: number; sy: number } => ({
      sx: (toroidDelta(current.x0, wx, deps.worldWidth) + 0.5) * current.pxPerTile,
      sy: (toroidDelta(current.y0, wy, deps.worldHeight) + 0.5) * current.pxPerTile
    });
    let drew = false;
    for (const label of labels) {
      // Glyph limits in canvas pixels. The floor is low on purpose: a long
      // name on a small territory shrinks to fit its land rather than spill
      // over the border.
      const style = { ...label.style, minFontPx: MIN_GLYPH_TILES * current.pxPerTile, maxFontPx: (label.kind === "player" ? 7 : 3.5) * current.pxPerTile };
      if (drawNameAlongPath(ctx, label.path, style, project, { width, height })) drew = true;
    }
    texture.needsUpdate = true;
    return drew;
  };

  const rebuildMesh = (current: CanvasArea, frame: NameDecalFrame): void => {
    // Ground under the window, but never past the canvas (a capped canvas on a huge window).
    const halfW = Math.min(frame.halfW, maxHalfW - 2);
    const halfH = Math.min(frame.halfH, maxHalfH - 2);
    const tilesX = 2 * halfW + 3;
    const tilesZ = 2 * halfH + 3;
    const originDx = -halfW - 1;
    const originDy = -halfH - 1;
    const cols = tilesX * SUBDIVISIONS + 1;
    const rows = tilesZ * SUBDIVISIONS + 1;
    const positions = new Float32Array(cols * rows * 3);
    const uvs = new Float32Array(cols * rows * 2);
    const areaOffsetX = toroidDelta(current.x0, frame.camX + originDx, deps.worldWidth);
    const areaOffsetY = toroidDelta(current.y0, frame.camY + originDy, deps.worldHeight);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const localX = col / SUBDIVISIONS;
        const localZ = row / SUBDIVISIONS;
        const tileX = Math.floor(localX);
        const tileZ = Math.floor(localZ);
        const wx = frame.camX + originDx + tileX;
        const wy = frame.camY + originDy + tileZ;
        const onCornerX = col % SUBDIVISIONS === 0;
        const onCornerZ = row % SUBDIVISIONS === 0;
        let y: number;
        if (onCornerX && onCornerZ) {
          y = deps.cornerYAt(deps.wrapX(wx), deps.wrapY(wy)) + CORNER_RISE;
        } else if (!onCornerX && !onCornerZ) {
          y = deps.tileCenterY(deps.wrapX(wx), deps.wrapY(wy));
        } else if (onCornerX) {
          y = (deps.cornerYAt(deps.wrapX(wx), deps.wrapY(wy)) + deps.cornerYAt(deps.wrapX(wx), deps.wrapY(wy + 1))) / 2 + CORNER_RISE;
        } else {
          y = (deps.cornerYAt(deps.wrapX(wx), deps.wrapY(wy)) + deps.cornerYAt(deps.wrapX(wx + 1), deps.wrapY(wy))) / 2 + CORNER_RISE;
        }
        const vertex = row * cols + col;
        positions[vertex * 3] = originDx + localX;
        positions[vertex * 3 + 1] = y;
        positions[vertex * 3 + 2] = originDy + localZ;
        uvs[vertex * 2] = (areaOffsetX + localX) / current.widthTiles;
        uvs[vertex * 2 + 1] = 1 - (areaOffsetY + localZ) / current.heightTiles;
      }
    }
    const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let index = 0;
    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        const a = row * cols + col;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices[index] = a;
        indices[index + 1] = c;
        indices[index + 2] = b;
        indices[index + 3] = b;
        indices[index + 4] = c;
        indices[index + 5] = d;
        index += 6;
      }
    }
    // A fresh geometry, and the old one disposed: replacing attributes in place
    // would leave the previous GL buffers allocated until the context dies.
    const next = new BufferGeometry();
    next.setAttribute("position", new BufferAttribute(positions, 3));
    next.setAttribute("uv", new BufferAttribute(uvs, 2));
    next.setIndex(new BufferAttribute(indices, 1));
    next.computeBoundingSphere();
    const previous = mesh.geometry;
    mesh.geometry = next;
    previous.dispose();
  };

  let lastFrame: NameDecalFrame | undefined;
  const sync = (frame: NameDecalFrame): void => {
    lastFrame = frame;
    if (!area || !areaCovers(area, frame)) {
      area = placeArea(frame);
      drawnSignature = "";
      meshKey = "";
    }
    const { labels, signature } = deps.source.current(frame.nowMs);
    if (labels.length === 0) {
      mesh.visible = false;
      drawnSignature = "";
      return;
    }
    if (signature !== drawnSignature) {
      hasInk = redraw(area, labels);
      drawnSignature = signature;
    }
    mesh.visible = hasInk;
    if (!hasInk) return;
    const nextMeshKey = `${area.x0},${area.y0},${frame.camX},${frame.camY},${frame.halfW},${frame.halfH}`;
    // Tile changes arrive constantly; re-sample the ground for them at most once a second.
    const terrainStale = frame.terrainRevision !== meshTerrainRevision && frame.nowMs - meshBuiltAt >= TERRAIN_RESAMPLE_MIN_INTERVAL_MS;
    if (nextMeshKey !== meshKey || terrainStale) {
      rebuildMesh(area, frame);
      meshKey = nextMeshKey;
      meshTerrainRevision = frame.terrainRevision;
      meshBuiltAt = frame.nowMs;
    }
  };

  return {
    sync,
    tick: (nowMs) => {
      if (lastFrame) sync({ ...lastFrame, nowMs });
    },
    dispose: () => {
      deps.scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  };
};

export type NameDecalForMapDeps = {
  readonly scene: Scene;
  readonly state: MapNameLabelSourceDeps["state"];
  readonly isExploredAt: (x: number, y: number) => boolean;
  readonly heightfield: TileSurfaceHeightfield;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly hillCutAt: () => (x: number, y: number) => RoadCutDirections | undefined;
  readonly rise: number;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly worldWidth: number;
  readonly worldHeight: number;
};

/** client-map-3d.ts's wiring: the shared label source plus the same surface-height rules as the other flat overlays. */
export const createNameDecalForMap = (deps: NameDecalForMapDeps): NameDecal =>
  createNameDecal({
    scene: deps.scene,
    source: createMapNameLabelSource({ state: deps.state, isExploredAt: deps.isExploredAt, wrapX: deps.wrapX, wrapY: deps.wrapY }),
    cornerYAt: (wx, wy) => deps.heightfield.cornerYAt(wx, wy),
    tileCenterY: (wx, wy) =>
      tileSurfaceHeights({
        heightfield: deps.heightfield, wx, wy, wxNext: deps.wrapX(wx + 1), wyNext: deps.wrapY(wy + 1), rise: deps.rise,
        isHillsAt: deps.isHillsAt, wrapX: deps.wrapX, wrapY: deps.wrapY, roadDirsAt: deps.hillCutAt()
      }).flatOverlayY,
    wrapX: deps.wrapX,
    wrapY: deps.wrapY,
    worldWidth: deps.worldWidth,
    worldHeight: deps.worldHeight
  });
