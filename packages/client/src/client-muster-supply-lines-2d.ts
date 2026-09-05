import { activeMusterSupplyLines, resolveAdvanceMusterFallbackSource, type AdvanceMusterFallbackCache, type MusterSupplyLine } from "./client-muster-transit/client-muster-transit.js";
import type { ClientState } from "./client-state/client-state.js";

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

let advanceSrcCache2D: AdvanceMusterFallbackCache;

// 2D-canvas equivalent of client-map-3d-capture-overlays.ts's marching-company
// overlay: flag → attack front, one per active muster flag/auto-fire fight.
// Covers three sources, matching the 3D renderer's coverage:
//   - a manually-armed muster transit (activeMusterSupplyLines)
//   - a server-fired ADVANCE-mode ATTACK not covered by any tracked flag
//     (state.capture fallback, only for attacks on owned tiles)
//   - ADVANCE/MARCH auto-fire's own mechanical travel-time delay
//     (state.outgoingMusterAttacksByTile), which also covers MARCH's
//     neutral-tile EXPAND fallback that the state.capture path above never
//     draws (EXPAND targets are never "owned" until the claim completes).
export function drawMusterSupplyLines2D(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  worldToScreen: WorldToScreen,
  ctx: CanvasRenderingContext2D,
  effectiveOverlayColor: (ownerId: string) => string,
  size: number,
  halfW: number,
  halfH: number,
  nowMs: number
): void {
  const lines = activeMusterSupplyLines(state, keyFor);
  const coveredTargetKeys = new Set(lines.map((line) => line.targetKey));
  const captureTargetKey = state.capture ? keyFor(state.capture.target.x, state.capture.target.y) : "";
  const targetOwned = Boolean(state.tiles.get(captureTargetKey)?.ownerId);
  if (state.capture && targetOwned && !coveredTargetKeys.has(captureTargetKey)) {
    const advanceFallback = resolveAdvanceMusterFallbackSource(state, captureTargetKey, state.capture.target, advanceSrcCache2D);
    advanceSrcCache2D = advanceFallback.cache;
    if (advanceFallback.result) {
      lines.push({
        musterX: advanceFallback.result.x,
        musterY: advanceFallback.result.y,
        targetX: state.capture.target.x,
        targetY: state.capture.target.y,
        targetKey: captureTargetKey,
        phase: "locked"
      });
      coveredTargetKeys.add(captureTargetKey);
    }
  }
  const nowEpochMs = Date.now();
  for (const [targetKey, outgoing] of state.outgoingMusterAttacksByTile) {
    if (coveredTargetKeys.has(targetKey)) continue;
    if (outgoing.transitEndsAt === undefined || outgoing.musterOriginX === undefined || outgoing.musterOriginY === undefined) continue;
    if (nowEpochMs >= outgoing.transitEndsAt) continue;
    lines.push({
      musterX: outgoing.musterOriginX,
      musterY: outgoing.musterOriginY,
      targetX: outgoing.originX,
      targetY: outgoing.originY,
      targetKey,
      phase: "transit"
    });
  }
  for (const line of lines) drawSupplyLine(line, worldToScreen, ctx, effectiveOverlayColor(state.me ?? ""), size, halfW, halfH, nowMs);
}

function drawSupplyLine(
  line: MusterSupplyLine,
  worldToScreen: WorldToScreen,
  ctx: CanvasRenderingContext2D,
  strokeColor: string,
  size: number,
  halfW: number,
  halfH: number,
  nowMs: number
): void {
  const srcScreen = worldToScreen(line.musterX, line.musterY, size, halfW, halfH);
  const tgtScreen = worldToScreen(line.targetX, line.targetY, size, halfW, halfH);
  const alpha = line.phase === "transit" ? 0.6 + 0.35 * Math.abs(Math.sin(nowMs / 400)) : 0.75;
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = line.phase === "transit" ? 3.5 : 2.5;
  if (line.phase === "transit") ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(srcScreen.sx, srcScreen.sy);
  ctx.lineTo(tgtScreen.sx, tgtScreen.sy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
