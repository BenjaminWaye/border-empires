// Verbose per-tile render logging for the 2D draw loop (localStorage
// "tile-debug-verbose" = "1" plus the admin tile-debug key). Extracted from
// client-runtime-loop.ts so the draw loop reads the flag once per frame and
// only builds these deps for a debug session, not per tile per frame.
import { debugTileLog, debugTileTimeline, tileMatchesDebugKey } from "./client-debug/client-debug.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

export type VerboseTileRenderLogDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  structureOverlayImages: Record<string, HTMLImageElement>;
  builtResourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  lastRenderedTileStateByKey: Map<string, string>;
};

export type VerboseTileRenderLogTile = { wx: number; wy: number; vis: TileVisibilityState; t: Tile | undefined };

export const logVerboseTileRender = (deps: VerboseTileRenderLogDeps, { wx, wy, vis, t }: VerboseTileRenderLogTile, size: number): void => {
  const { state } = deps;
  if (!tileMatchesDebugKey(wx, wy, 1, { fallbackTile: state.selected })) return;
  if (t && (vis === "visible" || vis === "fogged") && t.economicStructure) {
    debugTileLog(
      "render",
      {
        x: wx,
        y: wy,
        vis,
        detailLevel: t.detailLevel,
        economicStructure: t.economicStructure.type,
        overlayLoaded: Boolean(deps.structureOverlayImages[t.economicStructure.type]?.complete),
        hasBuiltResourceOverlay: Boolean(deps.builtResourceOverlayForTile(t)),
        zoom: size
      },
      { throttleKey: `${wx},${wy}`, minIntervalMs: 2000 }
    );
  } else if (t && vis === "visible") {
    debugTileLog(
      "render-missing-structure",
      {
        x: wx,
        y: wy,
        vis,
        detailLevel: t.detailLevel,
        resource: t.resource,
        town: Boolean(t.town),
        economicStructure: undefined,
        zoom: size
      },
      { throttleKey: `${wx},${wy}`, minIntervalMs: 2000 }
    );
  }
  const renderKey = deps.keyFor(wx, wy);
  const renderSignature = JSON.stringify({
    ownerId: t?.ownerId ?? null,
    ownershipState: t?.ownershipState ?? null,
    optimisticPending: t?.optimisticPending ?? null,
    detailLevel: t?.detailLevel ?? null,
    fogged: t?.fogged ?? null,
    vis
  });
  const previousRenderSignature = deps.lastRenderedTileStateByKey.get(renderKey);
  if (previousRenderSignature !== renderSignature) {
    debugTileTimeline("frontier-render-transition", {
      x: wx,
      y: wy,
      after: t,
      state,
      keyFor: deps.keyFor,
      extra: {
        vis,
        previousRenderSignature
      }
    });
    deps.lastRenderedTileStateByKey.set(renderKey, renderSignature);
  }
};
