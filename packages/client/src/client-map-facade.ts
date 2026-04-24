import { WORLD_HEIGHT, WORLD_WIDTH, grassShadeAt, landBiomeAt } from "@border-empires/shared";
import {
  buildMiniMapBase as buildMiniMapBaseFromModule,
  computeDockSeaRoute as computeDockSeaRouteFromModule,
  isDockRouteVisibleForPlayer as isDockRouteVisibleForPlayerFromModule,
  markDockDiscovered as markDockDiscoveredFromModule
} from "./client-dock-routes.js";
import { drawMiniMap as drawMiniMapIntoCanvas } from "./client-minimap.js";
import { resolveOwnerColor } from "./client-owner-colors.js";
import { revealWholeMapInTrue3DMode } from "./client-renderer-mode.js";
import {
  borderColorForOwner as borderColorForOwnerFromModule,
  borderLineWidthForOwner as borderLineWidthForOwnerFromModule,
  drawAetherBridgeLane as drawAetherBridgeLaneOnCanvas,
  drawAetherWallSegment as drawAetherWallSegmentOnCanvas,
  drawBarbarianSkullOverlay as drawBarbarianSkullOverlayOnCanvas,
  drawCenteredOverlay as drawCenteredOverlayOnCanvas,
  drawCenteredOverlayWithAlpha as drawCenteredOverlayWithAlphaOnCanvas,
  drawExposedTileBorder as drawExposedTileBorderOnCanvas,
  drawForestOverlay as drawForestOverlayOnCanvas,
  drawIncomingAttackOverlay as drawIncomingAttackOverlayOnCanvas,
  drawOwnershipSignature as drawOwnershipSignatureOnCanvas,
  drawResourceCornerMarker as drawResourceCornerMarkerOnCanvas,
  drawRoadOverlay as drawRoadOverlayOnCanvas,
  drawShardFallback as drawShardFallbackOnCanvas,
  drawTerrainTile as drawTerrainTileOnCanvas,
  drawTownOverlay as drawTownOverlayOnCanvas,
  effectiveOverlayColor as effectiveOverlayColorFromModule,
  fortificationOverlayImageFor as fortificationOverlayImageFromModule,
  shouldDrawOwnershipBorder as shouldDrawOwnershipBorderFromModule,
  structureAccentColor as structureAccentColorFromModule
} from "./client-map-render.js";
import type { FortificationOpening, FortificationOverlayKind } from "./client-fortification-overlays.js";
import type { RoadDirections } from "./client-road-network.js";
import type { ClientState } from "./client-state.js";
import type { DockPair, EmpireVisualStyle, StrategicReplayEvent, Tile, TileVisibilityState } from "./client-types.js";

type MapFacadeDeps = {
  state: ClientState;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  miniMapEl: HTMLCanvasElement;
  miniMapCtx: CanvasRenderingContext2D;
  miniMapBase: HTMLCanvasElement;
  miniMapBaseCtx: CanvasRenderingContext2D;
  keyFor: (x: number, y: number) => string;
  parseKey: (key: string) => { x: number; y: number };
  terrainAt: (x: number, y: number) => Tile["terrain"];
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  resourceColor: (resource: Tile["resource"]) => string | undefined;
  hasCollectableYield: (tile: Tile | undefined) => boolean;
};

export const createClientMapFacade = (deps: MapFacadeDeps) => {
  const {
    state,
    ctx,
    canvas,
    miniMapEl,
    miniMapCtx,
    miniMapBase,
    miniMapBaseCtx,
    keyFor,
    parseKey,
    terrainAt,
    wrapX,
    wrapY,
    resourceColor,
    hasCollectableYield
  } = deps;

  let miniMapBaseReady = false;
  let miniMapLastDrawCamX = Number.NaN;
  let miniMapLastDrawCamY = Number.NaN;
  let miniMapLastDrawZoom = Number.NaN;
  let miniMapLastReplayIndex = Number.NaN;
  let miniMapLastDrawAt = 0;
  const TERRAIN_COLOR_CACHE_LIMIT = 120_000;
  const terrainColorCache = new Map<string, string>();
  const terrainColorCacheOrder: string[] = [];

  const clearRenderCaches = (): void => {
    terrainColorCache.clear();
    terrainColorCacheOrder.length = 0;
    state.dockRouteCache.clear();
    miniMapBaseReady = false;
    miniMapLastDrawCamX = Number.NaN;
    miniMapLastDrawCamY = Number.NaN;
    miniMapLastDrawZoom = Number.NaN;
    miniMapLastReplayIndex = Number.NaN;
  };

  const tileVisibilityStateAt = (x: number, y: number, tile?: Tile): TileVisibilityState => {
    if (revealWholeMapInTrue3DMode) return "visible";
    if (state.fogDisabled) return "visible";
    const tileKey = keyFor(x, y);
    if (!state.discoveredTiles.has(tileKey)) return "unexplored";
    if (!tile || tile.fogged) return "fogged";
    return "visible";
  };

  const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;

  const hashString = (value: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const ownerColor = (ownerId: string): string => {
    if (ownerId === "barbarian") return "#2f3842";
    const hue = hashString(ownerId) % 360;
    return `hsl(${hue} 70% 48%)`;
  };

  const effectiveColor = (ownerId: string): string => resolveOwnerColor(ownerId, state.playerColors, ownerColor);
  const visualStyleForOwner = (ownerId: string): EmpireVisualStyle | undefined => state.playerVisualStyles.get(ownerId);
  const shieldUntilForOwner = (ownerId: string): number => state.playerShieldUntil.get(ownerId) ?? 0;
  const ownerSpawnShieldActive = (ownerId: string): boolean => shieldUntilForOwner(ownerId) > Date.now();

  const playerNameForOwner = (ownerId?: string | null): string | undefined => {
    if (!ownerId) return undefined;
    if (ownerId === state.me) return state.meName || "you";
    if (ownerId === "barbarian") return "Barbarians";
    return state.playerNames.get(ownerId);
  };

  const effectiveOverlayColor = (ownerId: string): string =>
    effectiveOverlayColorFromModule(ownerId, { ownerColor: effectiveColor, visualStyleForOwner });
  const borderColorForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): string =>
    borderColorForOwnerFromModule(ownerId, stateName, visualStyleForOwner);
  const shouldDrawOwnershipBorder = (tile: Tile): boolean => shouldDrawOwnershipBorderFromModule(tile, visualStyleForOwner);
  const borderLineWidthForOwner = (ownerId: string, stateName?: Tile["ownershipState"]): number =>
    borderLineWidthForOwnerFromModule(ownerId, stateName, visualStyleForOwner);
  const structureAccentColor = (ownerId: string, fallback: string): string =>
    structureAccentColorFromModule(ownerId, fallback, visualStyleForOwner);

  const drawAetherBridgeLane = (
    renderCtx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    nowMs: number,
    options?: { compact?: boolean }
  ): void => drawAetherBridgeLaneOnCanvas(renderCtx, fromX, fromY, toX, toY, nowMs, options);
  const drawAetherWallSegment = (
    renderCtx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    options?: { preview?: boolean; nowMs?: number }
  ): void => drawAetherWallSegmentOnCanvas(renderCtx, fromX, fromY, toX, toY, options);

  const isCoastalSea = (x: number, y: number): boolean => {
    const neighbors = [
      terrainAt(wrapX(x), wrapY(y - 1)),
      terrainAt(wrapX(x + 1), wrapY(y)),
      terrainAt(wrapX(x), wrapY(y + 1)),
      terrainAt(wrapX(x - 1), wrapY(y))
    ];
    return neighbors.includes("LAND");
  };

  const tileNoise = (x: number, y: number, seed: number): number => {
    const hash = hashString(`${wrapX(x)}:${wrapY(y)}:${seed}`);
    return (hash % 10_000) / 10_000;
  };

  const smoothstep = (t: number): number => t * t * (3 - 2 * t);

  const groupedNoise = (x: number, y: number, cell: number, seed: number): number => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const tx = (x % cell) / cell;
    const ty = (y % cell) / cell;
    const sx = smoothstep(tx);
    const sy = smoothstep(ty);
    const n00 = tileNoise(gx, gy, seed);
    const n10 = tileNoise(gx + 1, gy, seed);
    const n01 = tileNoise(gx, gy + 1, seed);
    const n11 = tileNoise(gx + 1, gy + 1, seed);
    const ix0 = n00 + (n10 - n00) * sx;
    const ix1 = n01 + (n11 - n01) * sx;
    return ix0 + (ix1 - ix0) * sy;
  };

  const landTone = (x: number, y: number): string => {
    const biome = landBiomeAt(x, y);
    if (biome === "COASTAL_SAND") return "#c8b27c";
    if (biome === "SAND") {
      const value = groupedNoise(x, y, 32, 907);
      return value < 0.5 ? "#bfa36e" : "#c9b07a";
    }
    const shade = grassShadeAt(x, y);
    return shade === "DARK" ? "#3f8a5c" : "#4d976a";
  };

  const terrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
    if (terrain === "SEA") return isCoastalSea(x, y) ? "#1f6ea0" : "#0b3d91";
    if (terrain === "MOUNTAIN") return "#8b8d92";
    return landTone(x, y);
  };

  const cachedTerrainColorAt = (x: number, y: number, terrain: Tile["terrain"]): string => {
    const cacheKey = `${x},${y},${terrain}`;
    const cached = terrainColorCache.get(cacheKey);
    if (cached) return cached;
    const color = terrainColorAt(x, y, terrain);
    terrainColorCache.set(cacheKey, color);
    terrainColorCacheOrder.push(cacheKey);
    if (terrainColorCacheOrder.length > TERRAIN_COLOR_CACHE_LIMIT) {
      const drop = terrainColorCacheOrder.shift();
      if (drop) terrainColorCache.delete(drop);
    }
    return color;
  };

  const drawTerrainTile = (wx: number, wy: number, terrain: Tile["terrain"], px: number, py: number, size: number): void =>
    drawTerrainTileOnCanvas(ctx, { wx, wy, terrain, px, py, size, wrapX, wrapY, cachedTerrainColorAt });
  const drawForestOverlay = (wx: number, wy: number, px: number, py: number, size: number): void =>
    drawForestOverlayOnCanvas(ctx, wx, wy, px, py, size);
  const drawBarbarianSkullOverlay = (px: number, py: number, size: number): void =>
    drawBarbarianSkullOverlayOnCanvas(ctx, px, py, size);
  const drawIncomingAttackOverlay = (wx: number, wy: number, px: number, py: number, size: number, resolvesAt: number): void =>
    drawIncomingAttackOverlayOnCanvas(ctx, wx, wy, px, py, size, resolvesAt);
  const drawTownOverlay = (tile: Tile, px: number, py: number, size: number): void =>
    drawTownOverlayOnCanvas(ctx, tile, px, py, size, tile.ownerId ? effectiveColor(tile.ownerId) : undefined);
  const drawCenteredOverlay = (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale = 1.08): void =>
    drawCenteredOverlayOnCanvas(ctx, overlay, px, py, size, scale);
  const drawCenteredOverlayWithAlpha = (
    overlay: HTMLImageElement | undefined,
    px: number,
    py: number,
    size: number,
    scale = 1.08,
    alpha = 1
  ): void => drawCenteredOverlayWithAlphaOnCanvas(ctx, overlay, px, py, size, scale, alpha);
  const drawResourceCornerMarker = (tile: Tile, px: number, py: number, size: number): void =>
    drawResourceCornerMarkerOnCanvas(ctx, tile, px, py, size, resourceColor);
  const drawRoadOverlay = (
    directions: RoadDirections,
    px: number,
    py: number,
    size: number
  ): void => drawRoadOverlayOnCanvas(ctx, directions, px, py, size);
  const fortificationOverlayImageFor = (
    kind: FortificationOverlayKind,
    opening: FortificationOpening
  ): HTMLImageElement | undefined => fortificationOverlayImageFromModule(kind, opening);
  const drawExposedTileBorder = (tile: Tile, px: number, py: number, size: number): void =>
    drawExposedTileBorderOnCanvas(ctx, tile, px, py, size, { tiles: state.tiles, keyFor, wrapX, wrapY });
  const drawShardFallback = (_tile: Tile, px: number, py: number, size: number): void => drawShardFallbackOnCanvas(ctx, px, py, size);
  const drawOwnershipSignature = (ownerId: string, px: number, py: number, size: number): void =>
    drawOwnershipSignatureOnCanvas(ctx, ownerId, px, py, size, visualStyleForOwner);

  const computeDockSeaRoute = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> =>
    computeDockSeaRouteFromModule(ax, ay, bx, by, { dockRouteCache: state.dockRouteCache, worldIndex, wrapX, wrapY });

  const markDockDiscovered = (tile: Tile): void =>
    markDockDiscoveredFromModule(tile, { discoveredDockTiles: state.discoveredDockTiles, keyFor });

  const isDockRouteVisibleForPlayer = (pair: DockPair): boolean =>
    isDockRouteVisibleForPlayerFromModule(pair, {
      fogDisabled: state.fogDisabled,
      selected: state.selected,
      discoveredDockTiles: state.discoveredDockTiles,
      keyFor
    });

  const buildMiniMapBase = (): void => {
    buildMiniMapBaseFromModule({ miniMapBase, miniMapBaseCtx, cachedTerrainColorAt });
    miniMapBaseReady = true;
    miniMapLastDrawCamX = Number.NaN;
  };

  const rebuildStrategicReplayState = (targetIndex: number): void => {
    const clamped = Math.max(0, Math.min(targetIndex, Math.max(0, state.strategicReplayEvents.length - 1)));
    state.replayOwnershipByTile.clear();
    for (let index = 0; index <= clamped; index += 1) {
      const event = state.strategicReplayEvents[index];
      if (!event || event.type !== "OWNERSHIP" || event.x === undefined || event.y === undefined) continue;
      const replayKey = keyFor(event.x, event.y);
      if (event.ownerId) {
        const replayTile: { ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" } = { ownerId: event.ownerId };
        if (event.ownershipState) replayTile.ownershipState = event.ownershipState;
        state.replayOwnershipByTile.set(replayKey, replayTile);
      } else {
        state.replayOwnershipByTile.delete(replayKey);
      }
    }
    state.replayAppliedIndex = clamped;
    state.replayIndex = clamped;
  };

  const resetStrategicReplayState = (): void => {
    state.replayIndex = Math.max(0, state.strategicReplayEvents.length - 1);
    state.replayAppliedIndex = 0;
    state.replayOwnershipByTile.clear();
    if (state.strategicReplayEvents.length > 0) rebuildStrategicReplayState(state.replayIndex);
  };

  const replayCurrentEvent = (): StrategicReplayEvent | undefined => state.strategicReplayEvents[state.replayIndex];

  const advanceStrategicReplay = (nowMs: number): void => {
    if (!state.replayActive || !state.replayPlaying || state.strategicReplayEvents.length < 2) {
      state.replayLastTickAt = nowMs;
      return;
    }
    if (!state.replayLastTickAt) state.replayLastTickAt = nowMs;
    const deltaSeconds = Math.max(0, (nowMs - state.replayLastTickAt) / 1000);
    state.replayLastTickAt = nowMs;
    const nextIndex = Math.min(state.strategicReplayEvents.length - 1, state.replayIndex + Math.max(1, Math.round(deltaSeconds * state.replaySpeed)));
    if (nextIndex === state.replayIndex) return;
    if (nextIndex >= state.strategicReplayEvents.length - 1) state.replayPlaying = false;
    rebuildStrategicReplayState(nextIndex);
  };

  const drawMiniMap = (): void => {
    const nowMs = performance.now();
    advanceStrategicReplay(nowMs);
    const changed = drawMiniMapIntoCanvas({
      nowMs,
      state,
      canvas,
      miniMapEl,
      miniMapCtx,
      miniMapBase,
      miniMapBaseReady,
      miniMapLast: {
        camX: miniMapLastDrawCamX,
        camY: miniMapLastDrawCamY,
        zoom: miniMapLastDrawZoom,
        replayIndex: miniMapLastReplayIndex,
        drawAt: miniMapLastDrawAt
      },
      parseKey,
      keyFor,
      tileVisibilityStateAt,
      effectiveOverlayColor,
      isDockRouteVisibleForPlayer,
      hasCollectableYield,
      replayCurrentEvent
    });
    if (!changed) return;
    miniMapLastDrawCamX = state.camX;
    miniMapLastDrawCamY = state.camY;
    miniMapLastDrawZoom = state.zoom;
    miniMapLastReplayIndex = state.replayActive ? state.replayIndex : Number.NaN;
    miniMapLastDrawAt = nowMs;
  };

  return {
    clearRenderCaches,
    tileVisibilityStateAt,
    ownerSpawnShieldActive,
    playerNameForOwner,
    effectiveOverlayColor,
    borderColorForOwner,
    shouldDrawOwnershipBorder,
    borderLineWidthForOwner,
    structureAccentColor,
    drawAetherBridgeLane,
    drawAetherWallSegment,
    drawTerrainTile,
    drawForestOverlay,
    drawBarbarianSkullOverlay,
    drawIncomingAttackOverlay,
    drawTownOverlay,
    drawCenteredOverlay,
    drawCenteredOverlayWithAlpha,
    drawResourceCornerMarker,
    drawRoadOverlay,
    fortificationOverlayImageFor,
    drawExposedTileBorder,
    drawShardFallback,
    drawOwnershipSignature,
    computeDockSeaRoute,
    markDockDiscovered,
    isDockRouteVisibleForPlayer,
    buildMiniMapBase,
    resetStrategicReplayState,
    drawMiniMap
  };
};
