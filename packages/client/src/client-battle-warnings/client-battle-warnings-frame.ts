// Per-frame battle-warning step, run from the persistent-alerts frame
// (client-persistent-alerts-frame.ts) in both renderers: pick up new
// incoming attacks, refresh the "Under attack" banner, and draw the
// lost-tile flash on the 2D canvas. The true-3D renderer draws the same
// flashes itself (client-battle-flash-3d.ts, client-map-3d.ts).
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";
import { createBattleWarningBanner } from "./client-battle-warning-banner.js";
import { drawBattleFlashes2D } from "./client-battle-flash-2d.js";
import { activeBattleFlashes, battleWarnings, battleWarningView, syncIncomingAttacks } from "./client-battle-warnings.js";

export type BattleWarningsFrameDeps = {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number };
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  size: number;
  halfW: number;
  halfH: number;
  photoMode: boolean;
};

export const createBattleWarningsFrame = (state: ClientState): ((deps: BattleWarningsFrameDeps) => void) => {
  const banner = createBattleWarningBanner(state, battleWarnings);
  return (deps) => {
    // Epoch ms throughout: losses are stamped with Date.now() and resolvesAt is server epoch time.
    const nowMs = Date.now();
    syncIncomingAttacks(battleWarnings, state, nowMs);
    banner.sync(deps.photoMode ? undefined : battleWarningView(battleWarnings, state, nowMs));
    if (deps.photoMode || isTrue3DRendererActive()) return;
    drawBattleFlashes2D(activeBattleFlashes(battleWarnings, nowMs), {
      ctx: deps.ctx,
      worldToScreen: deps.worldToScreen,
      viewportWidth: deps.canvas.width,
      viewportHeight: deps.canvas.height,
      size: deps.size,
      halfW: deps.halfW,
      halfH: deps.halfH,
      nowMs
    });
  };
};
