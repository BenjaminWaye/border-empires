import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { collectBattleRenderEntries } from "../client-map-3d-capture-overlays.js";
import { drawBattleMarkers2D } from "../client-battle-overlay/client-battle-overlay-2d.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { createAfcMapOverlays } from "../client-afc-upgrades/client-afc-map-overlays.js";
import type { ClientState } from "../client-state/client-state.js";
import { createSalvageReadyToasts } from "../client-salvage-tribute/client-salvage-ready-toasts.js";
import { createTownNameplates } from "../client-town-nameplates/client-town-nameplates.js";

type AfcMapOverlays = ReturnType<typeof createAfcMapOverlays>;
type MapOverlayTiles = Parameters<AfcMapOverlays["render"]>[0];
type MapOverlayProjection = Parameters<AfcMapOverlays["render"]>[1];

/** Screen overlays for visible tiles: 2D battle markers, town plates, AFC signals and salvage toasts. */
export function createMapScreenOverlays(canvas: HTMLCanvasElement, state: ClientState, openAfcUpgrades: () => void): {
  render: (tiles: MapOverlayTiles, projection: MapOverlayProjection) => void;
} {
  const townNameplates = createTownNameplates(canvas, state);
  const afcMapOverlays = createAfcMapOverlays(canvas, state, openAfcUpgrades);
  const salvageToasts = createSalvageReadyToasts(canvas, state);
  return {
    render(tiles, projection) {
      if (!isTrue3DRendererActive()) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const nowMs = performance.now();
          const { skirmishes } = collectBattleRenderEntries(state, (x, y) => `${x},${y}`,
            (id) => state.playerColors.get(id) ?? "#f06a74", () => 0, 0, 0, nowMs);
          // Match the 3D layer's 16 concurrent fights without growing a store.
          const pending = new Map(skirmishes.slice(0, 16).map((entry) => {
            const x = ((Math.round(entry.tgtWorldX - 0.5) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
            const y = ((Math.round(entry.tgtWorldZ - 0.5) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
            return [`${x},${y}`, entry] as const;
          }));
          drawBattleMarkers2D(ctx, state, tiles, projection, nowMs, pending);
        }
      }
      townNameplates.render(tiles, projection);
      afcMapOverlays.render(tiles, projection);
      salvageToasts.render(tiles, projection);
    }
  };
}
