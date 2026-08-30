// Extracted from client-map-3d.ts (500-line file cap) — the FX-cast sync
// handlers all share the same shape: drain a per-cast queue on state, convert
// each cast's world tile to a scene position via toroidDelta(origin, ...), and
// hand it to the matching FX layer's spawn(). Kept as one factory (rather than
// 13 standalone functions) so the origin/state/overlay wiring is passed once.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { filterAndLogSurveySweepPings } from "../survey-sweep-debug-log/survey-sweep-debug-log.js";
import { createAetherPurgeFxLayer } from "../client-map-3d-aether-purge-fx/client-map-3d-aether-purge-fx.js";
import { createSurveySweepFxLayer } from "../client-map-3d-survey-sweep-fx/client-map-3d-survey-sweep-fx.js";
import { createSurveySweepPingOverlay } from "../client-map-3d-survey-sweep-ping-overlay.js";
import { createSiphonFxLayer } from "../client-map-3d-siphon-fx/client-map-3d-siphon-fx.js";
import { createRetortRecastFxLayer } from "../client-map-3d-retort-recast-fx/client-map-3d-retort-recast-fx.js";
import { createRevealEmpireFxLayer } from "../client-map-3d-reveal-empire-fx/client-map-3d-reveal-empire-fx.js";
import { createMonumentPulseFxLayer } from "../client-map-3d-monument-pulse-fx/client-map-3d-monument-pulse-fx.js";
import { createUnsettleFxLayer } from "../client-map-3d-unsettle-fx/client-map-3d-unsettle-fx.js";
import { createCameraShakeFx } from "../client-map-3d-camera-shake-fx/client-map-3d-camera-shake-fx.js";
import { createAegisLockFxLayer } from "../client-map-3d-aegis-lock-fx/client-map-3d-aegis-lock-fx.js";
import { createRevealEmpireStatsFxLayer } from "../client-map-3d-reveal-empire-stats-fx/client-map-3d-reveal-empire-stats-fx.js";
import { createBombardFxLayer } from "../client-map-3d-bombard-fx/client-map-3d-bombard-fx.js";

const TILE_CENTER_OFFSET = 0.5;
const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.012;
export const AEGIS_LOCK_FIELD_RADIUS_TILES = 30;
export const AEGIS_LOCK_FIELD_DURATION_MS = 15 * 60_000;

export type FxCastOverlayLayers = {
  aetherLanceFx: ReturnType<typeof createAetherPurgeFxLayer>;
  surveySweepFx: ReturnType<typeof createSurveySweepFxLayer>;
  surveySweepPingOverlay: ReturnType<typeof createSurveySweepPingOverlay>;
  siphonFx: ReturnType<typeof createSiphonFxLayer>;
  retortRecastFx: ReturnType<typeof createRetortRecastFxLayer>;
  revealEmpireFx: ReturnType<typeof createRevealEmpireFxLayer>;
  revealEmpireStatsFx: ReturnType<typeof createRevealEmpireStatsFxLayer>;
  bombardFx: ReturnType<typeof createBombardFxLayer>;
  worldEngineStrikeFx: ReturnType<typeof createMonumentPulseFxLayer>;
  worldEngineShakeFx: ReturnType<typeof createCameraShakeFx>;
  imperialExchangeLevyFx: ReturnType<typeof createMonumentPulseFxLayer>;
  astralDockLaunchFx: ReturnType<typeof createRevealEmpireFxLayer>;
  aegisLockFx: ReturnType<typeof createAegisLockFxLayer>;
  unsettleFx: ReturnType<typeof createUnsettleFxLayer>;
};

export type FxCastOverlayDeps = {
  readonly state: ClientState;
  // Scene-space anchor for toroidDelta placement — the last committed terrain
  // rebuild's origin (see client-map-3d.ts's sceneOrigin), NOT the live camera.
  readonly sceneOrigin: { camX: number; camY: number };
  readonly aetherBridgeTileSurfaceY: (wx: number, wy: number) => number;
  readonly layers: FxCastOverlayLayers;
};

export type FxCastOverlaySyncs = {
  readonly syncAetherLanceFxQueue: () => void;
  readonly syncSurveySweepFxQueue: () => void;
  readonly syncSurveySweepPings: () => void;
  readonly syncSiphonFxQueue: () => void;
  readonly syncRetortRecastFxQueue: () => void;
  readonly syncRevealEmpireFxQueue: () => void;
  readonly syncRevealEmpireStatsFxQueue: () => void;
  readonly syncBombardFxQueue: () => void;
  readonly syncWorldEngineStrikeFxQueue: () => void;
  readonly syncWorldEngineStrikeShakeQueue: (nowMs: number) => void;
  readonly syncImperialExchangeLevyFxQueue: () => void;
  readonly syncUnsettleFxQueue: () => void;
  readonly syncAstralDockLaunchFxQueue: () => void;
  readonly syncAegisLockFxQueue: () => void;
};

export const createFxCastOverlaySyncs = (deps: FxCastOverlayDeps): FxCastOverlaySyncs => {
  const { state, sceneOrigin, aetherBridgeTileSurfaceY, layers } = deps;

  const sceneXZ = (x: number, y: number): { sceneX: number; sceneZ: number } => ({
    sceneX: toroidDelta(sceneOrigin.camX, x, WORLD_WIDTH) + TILE_CENTER_OFFSET,
    sceneZ: toroidDelta(sceneOrigin.camY, y, WORLD_HEIGHT) + TILE_CENTER_OFFSET
  });

  const syncAetherLanceFxQueue = (): void => {
    while (state.aetherLanceFxQueue.length > 0) {
      const cast = state.aetherLanceFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.aetherLanceFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncSurveySweepFxQueue = (): void => {
    while (state.surveySweepFxQueue.length > 0) {
      const cast = state.surveySweepFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.surveySweepFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncSurveySweepPings = (): void => {
    const wallNowMs = Date.now();
    layers.surveySweepPingOverlay.beginFrame();
    // camX/camY here are only for the debug log line — pass the live camera, not the rebuild anchor.
    state.surveySweepPings = filterAndLogSurveySweepPings(state.surveySweepPings, wallNowMs, state.camX, state.camY, (x, y) => {
      const { sceneX, sceneZ } = sceneXZ(x, y);
      return { sceneX, sceneZ, surfaceY: aetherBridgeTileSurfaceY(x, y) + MARKER_RISE_ABOVE_HEIGHTFIELD };
    });
    for (const ping of state.surveySweepPings) {
      const { sceneX, sceneZ } = sceneXZ(ping.x, ping.y);
      layers.surveySweepPingOverlay.addPing(
        ping.kind,
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(ping.x, ping.y) + MARKER_RISE_ABOVE_HEIGHTFIELD,
        wallNowMs,
        ping.createdAt,
        ping.expiresAt
      );
    }
    layers.surveySweepPingOverlay.commit();
  };

  const syncSiphonFxQueue = (): void => {
    while (state.siphonFxQueue.length > 0) {
      const cast = state.siphonFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.siphonFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncRetortRecastFxQueue = (): void => {
    while (state.retortRecastFxQueue.length > 0) {
      const cast = state.retortRecastFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.retortRecastFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD, cast.targetResource);
    }
  };

  const syncRevealEmpireFxQueue = (): void => {
    while (state.revealEmpireFxQueue.length > 0) {
      const cast = state.revealEmpireFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.revealEmpireFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncRevealEmpireStatsFxQueue = (): void => {
    while (state.revealEmpireStatsFxQueue.length > 0) {
      const cast = state.revealEmpireStatsFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.revealEmpireStatsFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncBombardFxQueue = (): void => {
    while (state.bombardFxQueue.length > 0) {
      const cast = state.bombardFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.bombardFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD, cast.tiles);
    }
  };

  const syncWorldEngineStrikeFxQueue = (): void => {
    while (state.worldEngineStrikeFxQueue.length > 0) {
      const cast = state.worldEngineStrikeFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.worldEngineStrikeFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncWorldEngineStrikeShakeQueue = (nowMs: number): void => {
    while (state.worldEngineStrikeShakeQueue.length > 0) {
      state.worldEngineStrikeShakeQueue.shift();
      layers.worldEngineShakeFx.trigger(nowMs);
    }
  };

  const syncImperialExchangeLevyFxQueue = (): void => {
    while (state.imperialExchangeLevyFxQueue.length > 0) {
      const cast = state.imperialExchangeLevyFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.imperialExchangeLevyFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncUnsettleFxQueue = (): void => {
    while (state.unsettleFxQueue.length > 0) {
      const cast = state.unsettleFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.unsettleFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncAstralDockLaunchFxQueue = (): void => {
    while (state.astralDockLaunchFxQueue.length > 0) {
      const cast = state.astralDockLaunchFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.astralDockLaunchFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD);
    }
  };

  const syncAegisLockFxQueue = (): void => {
    while (state.aegisLockFxQueue.length > 0) {
      const cast = state.aegisLockFxQueue.shift()!;
      const { sceneX, sceneZ } = sceneXZ(cast.x, cast.y);
      layers.aegisLockFx.spawn(
        sceneX,
        sceneZ,
        aetherBridgeTileSurfaceY(cast.x, cast.y) + MARKER_RISE_ABOVE_HEIGHTFIELD,
        AEGIS_LOCK_FIELD_RADIUS_TILES,
        AEGIS_LOCK_FIELD_DURATION_MS
      );
    }
  };

  return {
    syncAetherLanceFxQueue,
    syncSurveySweepFxQueue,
    syncSurveySweepPings,
    syncSiphonFxQueue,
    syncRetortRecastFxQueue,
    syncRevealEmpireFxQueue,
    syncRevealEmpireStatsFxQueue,
    syncBombardFxQueue,
    syncWorldEngineStrikeFxQueue,
    syncWorldEngineStrikeShakeQueue,
    syncImperialExchangeLevyFxQueue,
    syncUnsettleFxQueue,
    syncAstralDockLaunchFxQueue,
    syncAegisLockFxQueue
  };
};
