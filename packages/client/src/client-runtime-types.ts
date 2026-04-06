import type { initClientDom } from "./client-dom.js";
import type { RoadDirections } from "./client-road-network.js";
import type { ClientState } from "./client-state.js";
import type { DockPair, FeedSeverity, FeedType, Tile, TileVisibilityState, TileTimedProgress } from "./client-types.js";

type ClientDom = ReturnType<typeof initClientDom>;

export type VisibleRenderTile = {
  wx: number;
  wy: number;
  wk: string;
  px: number;
  py: number;
  vis: TileVisibilityState;
  t: Tile | undefined;
  settlementProgress: TileTimedProgress | undefined;
};

export type RuntimeLoopState = {
  lastDrawAt: number;
  roadNetwork: Map<string, RoadDirections>;
  roadNetworkBuiltAt: number;
};

export type StartClientRuntimeLoopDeps = {
  canvas: ClientDom["canvas"];
  ctx: ClientDom["ctx"];
  initTerrainTextures: () => void;
  isMobile: () => boolean;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  parseKey: (key: string) => { x: number; y: number };
  selectedTile: () => Tile | undefined;
  settlementProgressForTile: (x: number, y: number) => TileTimedProgress | undefined;
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  crystalTargetingTone: (ability: ClientState["crystalTargeting"]["ability"]) => "amber" | "cyan" | "red";
  startingExpansionArrowTargets: () => Array<{ x: number; y: number; dx: number; dy: number }>;
  drawTerrainTile: (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number) => void;
  drawForestOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  effectiveOverlayColor: (ownerId: string) => string;
  overlayVariantIndexAt: (x: number, y: number, mod: number) => number;
  dockOverlayVariants: Array<HTMLImageElement | undefined>;
  drawCenteredOverlay: (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale?: number) => void;
  builtResourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  resourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  economicStructureOverlayAlpha: (tile: Tile) => number;
  drawCenteredOverlayWithAlpha: (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale: number, alpha: number) => void;
  resourceOverlayScaleForTile: (tile: Tile) => number;
  drawResourceCornerMarker: (tile: Tile, px: number, py: number, size: number) => void;
  drawRoadOverlay: (directions: RoadDirections, px: number, py: number, size: number) => void;
  fortificationOverlayImageFor: (
    kind: "FORT" | "SIEGE_OUTPOST" | "WOODEN_FORT" | "LIGHT_OUTPOST",
    opening: "CLOSED" | "NORTH" | "EAST" | "SOUTH" | "WEST"
  ) => HTMLImageElement | undefined;
  resourceColor: (resource: Tile["resource"]) => string | undefined;
  shardOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  drawShardFallback: (tile: Tile, px: number, py: number, size: number) => void;
  drawTownOverlay: (tile: Tile, px: number, py: number, size: number) => void;
  hasCollectableYield: (tile: Tile | undefined) => boolean;
  structureAccentColor: (ownerId: string, fallback: string) => string;
  structureOverlayImages: Record<string, HTMLImageElement>;
  constructionRemainingMsForTile: (tile: Tile) => number | undefined;
  formatCountdownClock: (ms: number) => string;
  drawStartingExpansionArrow: (px: number, py: number, size: number, dx: number, dy: number) => void;
  drawBarbarianSkullOverlay: (px: number, py: number, size: number) => void;
  shouldDrawOwnershipBorder: (tile: Tile) => boolean;
  borderColorForOwner: (ownerId: string, stateName?: Tile["ownershipState"]) => string;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  borderLineWidthForOwner: (ownerId: string, stateName?: Tile["ownershipState"]) => number;
  drawExposedTileBorder: (tile: Tile, px: number, py: number, size: number) => void;
  isTownSupportNeighbor: (tx: number, ty: number, sx: number, sy: number) => boolean;
  isTownSupportHighlightableTile: (tile: Tile | undefined) => boolean;
  drawIncomingAttackOverlay: (wx: number, wy: number, px: number, py: number, size: number, resolvesAt: number) => void;
  settlePixelWanderPoint: (nowMs: number, wx: number, wy: number, i: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  isDockRouteVisibleForPlayer: (pair: DockPair) => boolean;
  computeDockSeaRoute: (ax: number, ay: number, bx: number, by: number) => Array<{ x: number; y: number }>;
  toroidDelta: (from: number, to: number, dim: number) => number;
  drawAetherBridgeLane: (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, nowMs: number) => void;
  drawMiniMap: () => void;
  maybeRefreshForCamera: (force?: boolean) => void;
  renderHud: () => void;
  renderCaptureProgress: () => void;
  renderShardAlert: () => void;
  cleanupExpiredSettlementProgress: () => boolean;
  processDevelopmentQueue: () => boolean;
  clearOptimisticTileState: (tileKey: string, revert?: boolean) => void;
  dropQueuedTargetKeyIfAbsent: (targetKey: string) => void;
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  processActionQueue: () => boolean;
  shouldPreserveOptimisticExpandByKey: (tileKey: string) => boolean;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
  reconcileActionQueue: () => void;
};
