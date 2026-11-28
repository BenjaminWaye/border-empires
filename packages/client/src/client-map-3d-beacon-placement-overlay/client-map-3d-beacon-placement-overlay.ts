import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, PlaneGeometry, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import {
  OUTLINE_EDGE_CORNERS,
  beaconExpansionElapsedMs,
  beaconExpansionOutline,
  beaconExpansionTileFill,
  beaconReachExpansion,
  prefersReducedMotion
} from "../client-beacon-reach-expansion/client-beacon-reach-expansion.js";
import type { PlacementOverlaySyncDeps } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";

// True-3D counterpart to client-placement-preview-2d.ts's Relay Beacon
// preview: while a Relay Beacon is being placed, the ground the beacon would
// *newly* bring into reach grows out from the chosen tile, ring by ring,
// inside a solid outline of where it ends (client-beacon-reach-expansion.ts,
// shared with the 2D canvas). A valid spot shows no range square: the
// shared placement-range marker in client-map-3d-placement-overlay.ts draws
// only the red ring of an invalid one.

const NEW_REACH_RISE_ABOVE_HEIGHTFIELD = 0.013;
// OUTPOST reach radius 5 -> an 11x11 disk at most.
const MAX_NEW_REACH_TILES = 11 * 11;
// Every side of every tile at most: 2 vertices x 3 floats each.
const MAX_OUTLINE_EDGES = MAX_NEW_REACH_TILES * 4;
const OUTLINE_RISE_ABOVE_HEIGHTFIELD = 0.02;

export type BeaconPlacementOverlay = {
  readonly sync: (deps: PlacementOverlaySyncDeps) => void;
  readonly hide: () => void;
};

/** Mean of a tile's four heightfield corners -- where flat tile-sized placement tints sit (shared with the beneficiary highlights). */
export const tileCornerMeanY = (cornerYAt: PlacementOverlaySyncDeps["cornerYAt"], wx: number, wy: number): number => {
  const wxNext = wx + 1 >= WORLD_WIDTH ? 0 : wx + 1;
  const wyNext = wy + 1 >= WORLD_HEIGHT ? 0 : wy + 1;
  return (cornerYAt(wx, wy) + cornerYAt(wxNext, wy) + cornerYAt(wx, wyNext) + cornerYAt(wxNext, wyNext)) / 4;
};

export const createBeaconPlacementOverlay = (scene: Scene): BeaconPlacementOverlay => {
  const reachGeometry = new PlaneGeometry(0.92, 0.92);
  reachGeometry.rotateX(-Math.PI * 0.5);
  const reachMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#78dcff", transparent: true, opacity: 0.38, depthTest: false, depthWrite: false, side: DoubleSide });
  const reachFill = new InstancedMesh(reachGeometry, reachMaterial, MAX_NEW_REACH_TILES);
  reachFill.instanceMatrix.setUsage(DynamicDrawUsage);
  reachFill.frustumCulled = false;
  reachFill.renderOrder = 13;
  reachFill.count = 0;
  reachFill.visible = false;

  const outlinePositions = new Float32Array(MAX_OUTLINE_EDGES * 2 * 3);
  const outlineGeometry = new BufferGeometry();
  outlineGeometry.setAttribute("position", new BufferAttribute(outlinePositions, 3).setUsage(DynamicDrawUsage));
  outlineGeometry.setDrawRange(0, 0);
  const outline = new LineSegments(outlineGeometry, new LineBasicMaterial({ color: "#bef0ff", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
  outline.frustumCulled = false;
  outline.renderOrder = 14;
  outline.visible = false;

  scene.add(reachFill, outline);
  const matrix = new Matrix4();

  /** A tile grows from its centre as the wave reaches it (`fill` 0..1). */
  const placeAt = (index: number, deps: PlacementOverlaySyncDeps, wx: number, wy: number, fill: number): void => {
    const localX = toroidDelta(deps.sceneOrigin.camX, wx, WORLD_WIDTH) + 0.5;
    const localZ = toroidDelta(deps.sceneOrigin.camY, wy, WORLD_HEIGHT) + 0.5;
    matrix.makeScale(fill, 1, fill).setPosition(localX, tileCornerMeanY(deps.cornerYAt, wx, wy) + NEW_REACH_RISE_ABOVE_HEIGHTFIELD, localZ);
    reachFill.setMatrixAt(index, matrix);
  };

  const wrapCorner = (value: number, size: number): number => (value >= size ? value - size : value);

  const syncOutline = (deps: PlacementOverlaySyncDeps, expansion: ReturnType<typeof beaconReachExpansion>): void => {
    let vertex = 0;
    for (const edge of beaconExpansionOutline(expansion, deps.keyFor, deps.wrapX, deps.wrapY)) {
      if (vertex / 2 >= MAX_OUTLINE_EDGES) break;
      for (const [dx, dy] of OUTLINE_EDGE_CORNERS[edge.side]) {
        const cx = wrapCorner(edge.x + dx, WORLD_WIDTH);
        const cy = wrapCorner(edge.y + dy, WORLD_HEIGHT);
        outlinePositions[vertex * 3] = toroidDelta(deps.sceneOrigin.camX, edge.x, WORLD_WIDTH) + dx;
        outlinePositions[vertex * 3 + 1] = deps.cornerYAt(cx, cy) + OUTLINE_RISE_ABOVE_HEIGHTFIELD;
        outlinePositions[vertex * 3 + 2] = toroidDelta(deps.sceneOrigin.camY, edge.y, WORLD_HEIGHT) + dy;
        vertex += 1;
      }
    }
    outlineGeometry.setDrawRange(0, vertex);
    (outlineGeometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    outline.visible = vertex > 0;
  };

  const commit = (count: number): void => {
    reachFill.count = count;
    reachFill.visible = count > 0;
    if (count === 0) return;
    reachFill.instanceMatrix.clearUpdateRanges();
    reachFill.instanceMatrix.addUpdateRange(0, count * 16);
    reachFill.instanceMatrix.needsUpdate = true;
  };

  const syncNewReach = (deps: PlacementOverlaySyncDeps): void => {
    const { x, y } = deps.state.buildingPlacement;
    if (deps.tileVisibilityStateAt(x, y, deps.state.tiles.get(deps.keyFor(x, y))) !== "visible") {
      commit(0);
      return;
    }
    if (!deps.isPlacementValidForTile(deps.state.tiles.get(deps.keyFor(x, y)))) {
      hide();
      return;
    }
    const expansion = beaconReachExpansion(deps.state, x, y); // land-gated, less what is already in reach; same as 2D
    const elapsed = beaconExpansionElapsedMs(x, y, deps.nowMs ?? performance.now());
    const still = prefersReducedMotion();
    let count = 0;
    for (const tile of expansion.tiles) {
      if (count >= MAX_NEW_REACH_TILES) break;
      const fill = beaconExpansionTileFill(tile.ring, elapsed, still);
      if (fill <= 0) continue;
      placeAt(count, deps, tile.x, tile.y, fill);
      count += 1;
    }
    commit(count);
    syncOutline(deps, expansion);
  };

  const hide = (): void => {
    commit(0);
    outline.visible = false;
  };

  const sync = (deps: PlacementOverlaySyncDeps): void => {
    if (!deps.state.buildingPlacement.active || deps.state.buildingPlacement.structureType !== "RELAY_BEACON") {
      hide();
      return;
    }
    syncNewReach(deps);
  };

  return { sync, hide };
};
