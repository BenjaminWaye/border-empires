import {
  BufferGeometry,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Scene
} from "three";
import { OBSERVATORY_RANGE_MAX, WORLD_HEIGHT, WORLD_WIDTH, reachRadiusForKind, type ReachAnchorKind } from "@border-empires/shared";
import { AIRPORT_BOMBARD_RADIUS } from "../client-constants.js";
import { WATERWORKS_RADIUS } from "../client-structure-effects/client-structure-effects.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import { reachAnchorKindForTile } from "../client-reach-overlay-structure-highlight/client-reach-overlay-structure-highlight.js";
import {
  createObservatoryRangeBorderGeometry,
  createObservatoryRangeFillGeometry,
  observatoryRangeBorderSegmentCount,
  observatoryRangeFillVertexCount,
  writeObservatoryRangeBorderGeometry,
  writeObservatoryRangeFillGeometry,
  type ObservatoryRangeBorderGeometryInputs
} from "../client-map-3d-observatory-range/client-map-3d-observatory-range.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";

// Extracted out of client-map-3d.ts (500-line file cap, AGENTS.md): every
// square range/reach ring drawn around the currently-selected tile
// (observatory sweep, waterworks, airport, and this module's own
// reach-disk highlight) is the same cohesive "selection range overlay"
// concern, distinct from the terrain/heightfield/marker rigging around it.
//
// REACH_RADIUS_MAX_CANDIDATES: mirrors client-reach-overlay-structure-highlight's
// reachAnchorKindForTile -- this is the true-3D counterpart of that 2D-only
// overlay, so a player on the 3D renderer (not just the 2D fallback used by
// low-end/broken-phone clients) also sees a selected town/dock/outpost-family
// structure's reach disk highlighted.
const REACH_RADIUS_MAX = Math.max(
  reachRadiusForKind("TOWN"),
  reachRadiusForKind("OUTPOST"),
  reachRadiusForKind("DOCK")
);

const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.012;

export type SelectionRangeOverlaysDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  sceneOrigin: { camX: number; camY: number };
  cornerYAt: (x: number, y: number) => number;
};

export type SelectionRangeOverlays = {
  sync: (deps: SelectionRangeOverlaysDeps) => void;
  dispose: () => void;
};

const makeRingMaterials = (color: string, borderOpacity: number, fillOpacity: number) => ({
  border: new LineBasicMaterial({ color, transparent: true, opacity: borderOpacity, depthTest: false, depthWrite: false }),
  fill: new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity: fillOpacity, depthTest: false, depthWrite: false, side: DoubleSide })
});

const makeRingMeshes = (maxRadius: number, materials: { border: LineBasicMaterial; fill: MeshBasicMaterial }) => {
  const maxSegments = observatoryRangeBorderSegmentCount(maxRadius);
  const maxFillVertices = observatoryRangeFillVertexCount(maxRadius);
  const border = new LineSegments(createObservatoryRangeBorderGeometry(maxSegments), materials.border);
  const fill = new Mesh(createObservatoryRangeFillGeometry(maxFillVertices), materials.fill);
  border.visible = false;
  fill.visible = false;
  border.frustumCulled = false;
  fill.frustumCulled = false;
  return { border, fill };
};

export const createSelectionRangeOverlays = (scene: Scene): SelectionRangeOverlays => {
  const observatoryMaterials = makeRingMaterials("#6ab4ff", 0.55, 0.10);
  const observatoryRing = makeRingMeshes(OBSERVATORY_RANGE_MAX, observatoryMaterials);
  const waterworksMaterials = makeRingMaterials("#4caf74", 0.55, 0.10);
  const waterworksRing = makeRingMeshes(WATERWORKS_RADIUS, waterworksMaterials);
  const airportMaterials = makeRingMaterials("#ff4444", 0.55, 0.10);
  const airportRing = makeRingMeshes(AIRPORT_BOMBARD_RADIUS, airportMaterials);
  const reachMaterials = makeRingMaterials("#3ddc74", 0.6, 0.14);
  const reachRing = makeRingMeshes(REACH_RADIUS_MAX, reachMaterials);

  observatoryRing.border.renderOrder = 26;
  observatoryRing.fill.renderOrder = 24;
  waterworksRing.border.renderOrder = 19;
  waterworksRing.fill.renderOrder = 18;
  airportRing.border.renderOrder = 17;
  airportRing.fill.renderOrder = 16;
  reachRing.border.renderOrder = 21;
  reachRing.fill.renderOrder = 20;

  scene.add(
    waterworksRing.fill,
    waterworksRing.border,
    airportRing.fill,
    airportRing.border,
    reachRing.fill,
    reachRing.border,
    observatoryRing.fill,
    observatoryRing.border
  );

  const writeRingGeometry = (
    ring: { border: LineSegments; fill: Mesh },
    deps: SelectionRangeOverlaysDeps,
    selectedTile: Tile,
    radius: number
  ): void => {
    const rangeGeometryInputs: ObservatoryRangeBorderGeometryInputs = {
      selectedX: selectedTile.x,
      selectedY: selectedTile.y,
      camX: deps.sceneOrigin.camX,
      camY: deps.sceneOrigin.camY,
      radius,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      wrapX: deps.wrapX,
      wrapY: deps.wrapY,
      cornerYAt: deps.cornerYAt,
      riseAboveSurface: MARKER_RISE_ABOVE_HEIGHTFIELD
    };
    writeObservatoryRangeBorderGeometry(ring.border.geometry as BufferGeometry, rangeGeometryInputs);
    writeObservatoryRangeFillGeometry(ring.fill.geometry as BufferGeometry, rangeGeometryInputs);
    ring.border.visible = true;
    ring.fill.visible = true;
  };

  const selectedTileFor = (deps: SelectionRangeOverlaysDeps): Tile | undefined => {
    const selectedCoord = deps.state.selected;
    if (!selectedCoord) return undefined;
    return deps.state.tiles.get(deps.keyFor(selectedCoord.x, selectedCoord.y));
  };

  const syncObservatoryRing = (deps: SelectionRangeOverlaysDeps): void => {
    observatoryRing.border.visible = false;
    observatoryRing.fill.visible = false;
    const selectedTile = selectedTileFor(deps);
    if (!selectedTile?.observatory) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    if (selectedTile.ownerId !== deps.state.me) return;
    if (selectedTile.observatory.status !== "active") return;
    writeRingGeometry(observatoryRing, deps, selectedTile, ownObservatoryRange(deps.state));
  };

  const syncWaterworksRing = (deps: SelectionRangeOverlaysDeps): void => {
    waterworksRing.border.visible = false;
    waterworksRing.fill.visible = false;
    const selectedTile = selectedTileFor(deps);
    if (!selectedTile) return;
    if (selectedTile.economicStructure?.type !== "WATERWORKS") return;
    if (selectedTile.economicStructure.status !== "active") return;
    if (selectedTile.ownerId !== deps.state.me) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    writeRingGeometry(waterworksRing, deps, selectedTile, WATERWORKS_RADIUS);
  };

  const syncAirportRing = (deps: SelectionRangeOverlaysDeps): void => {
    airportRing.border.visible = false;
    airportRing.fill.visible = false;
    const selectedTile = selectedTileFor(deps);
    if (!selectedTile) return;
    if (selectedTile.economicStructure?.type !== "AIRPORT") return;
    if (selectedTile.economicStructure.status !== "active") return;
    if (selectedTile.ownerId !== deps.state.me) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    writeRingGeometry(airportRing, deps, selectedTile, AIRPORT_BOMBARD_RADIUS);
  };

  // True-3D counterpart of client-reach-overlay-structure-highlight.ts's 2D
  // green tile tint: selecting a town, dock, or outpost-family structure
  // highlights its own reach disk here too, not just on the 2D fallback map.
  const syncReachRing = (deps: SelectionRangeOverlaysDeps): void => {
    reachRing.border.visible = false;
    reachRing.fill.visible = false;
    const selectedTile = selectedTileFor(deps);
    if (!selectedTile) return;
    if (deps.tileVisibilityStateAt(selectedTile.x, selectedTile.y, selectedTile) !== "visible") return;
    const kind: ReachAnchorKind | undefined = reachAnchorKindForTile(selectedTile);
    if (!kind) return;
    writeRingGeometry(reachRing, deps, selectedTile, reachRadiusForKind(kind));
  };

  const sync = (deps: SelectionRangeOverlaysDeps): void => {
    syncObservatoryRing(deps);
    syncWaterworksRing(deps);
    syncAirportRing(deps);
    syncReachRing(deps);
  };

  const dispose = (): void => {
    for (const ring of [observatoryRing, waterworksRing, airportRing, reachRing]) {
      ring.border.geometry.dispose();
      ring.fill.geometry.dispose();
    }
    for (const materials of [observatoryMaterials, waterworksMaterials, airportMaterials, reachMaterials]) {
      materials.border.dispose();
      materials.fill.dispose();
    }
  };

  return { sync, dispose };
};
