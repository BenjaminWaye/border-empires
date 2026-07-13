import {
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import {
  createObservatoryRangeBorderGeometry,
  createObservatoryRangeFillGeometry,
  observatoryRangeBorderSegmentCount,
  observatoryRangeFillVertexCount,
  writeObservatoryRangeBorderGeometry,
  writeObservatoryRangeFillGeometry,
  type ObservatoryRangeBorderGeometryInputs
} from "../client-map-3d-observatory-range/client-map-3d-observatory-range.js";
import {
  FOUNDRY_RADIUS,
  WATERWORKS_RADIUS,
  placementRadius,
  tileIsPlacementBeneficiary
} from "../client-structure-effects/client-structure-effects.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";

const RANGE_RISE_ABOVE_HEIGHTFIELD = 0.012;
const BENEFICIARY_RISE_ABOVE_HEIGHTFIELD = 0.014;
const MAX_PLACEMENT_RADIUS = Math.max(WATERWORKS_RADIUS, FOUNDRY_RADIUS);
const MAX_BENEFICIARY_TILES = (MAX_PLACEMENT_RADIUS * 2 + 1) ** 2;

export type PlacementOverlaySyncDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  isPlacementValidForTile: (tile: Tile | undefined) => boolean;
  cornerYAt: (x: number, y: number) => number;
};

export type PlacementRangeOverlay = {
  readonly sync: (deps: PlacementOverlaySyncDeps) => void;
};

// Renders the building-placement radius ring (yellow when valid, red when
// invalid) plus a green highlight on every tile within radius that would
// benefit from the structure being placed (MINE tiles for Foundry,
// FARMSTEAD tiles for Waterworks). Beneficiary highlighting is bounded to
// MAX_BENEFICIARY_TILES (441 at the current largest radius, 10) regardless
// of world/map size.
export const createPlacementRangeOverlay = (scene: Scene): PlacementRangeOverlay => {
  const validMaterial = new LineBasicMaterial({ color: "#f5d742", transparent: true, opacity: 0.65, depthTest: false, depthWrite: false });
  const validFillMaterial = new MeshBasicMaterial({ color: "#f5d742", transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, side: DoubleSide });
  const invalidMaterial = new LineBasicMaterial({ color: "#dc5050", transparent: true, opacity: 0.65, depthTest: false, depthWrite: false });
  const invalidFillMaterial = new MeshBasicMaterial({ color: "#dc5050", transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, side: DoubleSide });

  const maxSegments = observatoryRangeBorderSegmentCount(MAX_PLACEMENT_RADIUS);
  const maxFillVertices = observatoryRangeFillVertexCount(MAX_PLACEMENT_RADIUS);
  const marker = new LineSegments(createObservatoryRangeBorderGeometry(maxSegments), validMaterial);
  const fill = new Mesh(createObservatoryRangeFillGeometry(maxFillVertices), validFillMaterial);
  marker.visible = false;
  fill.visible = false;
  marker.renderOrder = 15;
  fill.renderOrder = 14;
  marker.frustumCulled = false;
  fill.frustumCulled = false;

  const benefitGeometry = new PlaneGeometry(0.92, 0.92);
  benefitGeometry.rotateX(-Math.PI * 0.5);
  const benefitMaterial = new MeshBasicMaterial({
    color: "#50dc6e",
    transparent: true,
    opacity: 0.42,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const benefitFill = new InstancedMesh(benefitGeometry, benefitMaterial, MAX_BENEFICIARY_TILES);
  benefitFill.frustumCulled = false;
  benefitFill.renderOrder = 13;
  benefitFill.count = 0;
  benefitFill.visible = false;

  scene.add(marker, fill, benefitFill);

  const tempMatrix = new Matrix4();

  const syncBeneficiaryHighlights = (
    deps: PlacementOverlaySyncDeps,
    structureType: "WATERWORKS" | "FOUNDRY",
    centerX: number,
    centerY: number,
    radius: number
  ): void => {
    let count = 0;
    for (let dy = -radius; dy <= radius && count < MAX_BENEFICIARY_TILES; dy += 1) {
      for (let dx = -radius; dx <= radius && count < MAX_BENEFICIARY_TILES; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const wx = deps.wrapX(centerX + dx);
        const wy = deps.wrapY(centerY + dy);
        const tile = deps.state.tiles.get(deps.keyFor(wx, wy));
        if (!tile) continue;
        if (deps.tileVisibilityStateAt(wx, wy, tile) !== "visible") continue;
        if (!tileIsPlacementBeneficiary(tile, structureType, deps.state.me)) continue;
        const localX = toroidDelta(deps.state.camX, wx, WORLD_WIDTH) + 0.5;
        const localZ = toroidDelta(deps.state.camY, wy, WORLD_HEIGHT) + 0.5;
        const wxNext = wx + 1 >= WORLD_WIDTH ? 0 : wx + 1;
        const wyNext = wy + 1 >= WORLD_HEIGHT ? 0 : wy + 1;
        const surfaceY =
          (deps.cornerYAt(wx, wy) + deps.cornerYAt(wxNext, wy) + deps.cornerYAt(wx, wyNext) + deps.cornerYAt(wxNext, wyNext)) / 4;
        tempMatrix.makeTranslation(localX, surfaceY + BENEFICIARY_RISE_ABOVE_HEIGHTFIELD, localZ);
        benefitFill.setMatrixAt(count, tempMatrix);
        count += 1;
      }
    }
    benefitFill.count = count;
    benefitFill.visible = count > 0;
    if (count > 0) benefitFill.instanceMatrix.needsUpdate = true;
  };

  const sync = (deps: PlacementOverlaySyncDeps): void => {
    marker.visible = false;
    fill.visible = false;
    benefitFill.visible = false;
    benefitFill.count = 0;
    if (!deps.state.buildingPlacement.active) return;
    const { x, y, structureType } = deps.state.buildingPlacement;
    if (structureType !== "WATERWORKS" && structureType !== "FOUNDRY") return;
    const tile = deps.state.tiles.get(deps.keyFor(x, y));
    if (deps.tileVisibilityStateAt(x, y, tile) !== "visible") return;
    const valid = deps.isPlacementValidForTile(tile);
    const radius = placementRadius(structureType);

    syncBeneficiaryHighlights(deps, structureType, x, y, radius);

    marker.material = valid ? validMaterial : invalidMaterial;
    fill.material = valid ? validFillMaterial : invalidFillMaterial;
    const rangeGeometryInputs: ObservatoryRangeBorderGeometryInputs = {
      selectedX: x,
      selectedY: y,
      camX: deps.state.camX,
      camY: deps.state.camY,
      radius,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      wrapX: deps.wrapX,
      wrapY: deps.wrapY,
      cornerYAt: deps.cornerYAt,
      riseAboveSurface: RANGE_RISE_ABOVE_HEIGHTFIELD
    };
    writeObservatoryRangeBorderGeometry(marker.geometry as BufferGeometry, rangeGeometryInputs);
    writeObservatoryRangeFillGeometry(fill.geometry as BufferGeometry, rangeGeometryInputs);
    marker.visible = true;
    fill.visible = true;
  };

  return { sync };
};
