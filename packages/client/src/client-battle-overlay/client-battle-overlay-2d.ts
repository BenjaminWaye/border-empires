import { pruneExpiredActiveBattles, type ActiveBattleOverlay } from "./client-battle-overlay.js";
import { computeBattlePose, computeSkirmishPose, MARINES_PER_SIDE, type BattleOverlayRenderEntry, type BattleOverlaySkirmishEntry } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import { battleChoreographyFor } from "../client-map-3d-popup-marine/popup-marine-choreography.js";
import { garrisonStartFor } from "../client-map-3d-popup-marine/popup-marine-garrison.js";
import { computeBattleBolts, computeSkirmishBolts } from "../client-map-3d-popup-marine/popup-marine-bolts.js";
import type { ClientState } from "../client-state/client-state.js";

type VisibleTile = { px: number; py: number; wk: string; vis: string };
type Projection = { size: number; project: (x: number, y: number) => { sx: number; sy: number } };

export const battleMarkerEntry = (battle: ActiveBattleOverlay, attackerColor: string, defenderColor: string): BattleOverlayRenderEntry => ({
  ...battle, srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0,
  srcSurfaceY: 0, tgtSurfaceY: 0, attackerColor, defenderColor,
  hashSeed: battle.targetX * 92821 + battle.targetY,
  choreography: battleChoreographyFor(battle.targetX * 92821 + battle.targetY)
});

/** Canvas parity: two seven-dot squads exchange fire, break, or stage the same
 * last stand/comeback as the infantry. Only currently visible tiles are drawn. */
export const drawBattleMarkers2D = (
  ctx: CanvasRenderingContext2D, state: Pick<ClientState, "activeBattles" | "playerColors">,
  tiles: readonly VisibleTile[], projection: Projection, nowMs: number,
  skirmishes?: ReadonlyMap<string, BattleOverlaySkirmishEntry>
): void => {
  pruneExpiredActiveBattles(state, nowMs);
  for (const tile of tiles) {
    if (tile.vis !== "visible") continue;
    const battle = state.activeBattles.get(tile.wk);
    const unresolved = skirmishes?.get(tile.wk);
    const resolved = battle && nowMs >= battle.clashAt ? battleMarkerEntry(battle,
      state.playerColors.get(battle.attackerOwnerId) ?? "#ffd54a", state.playerColors.get(battle.defenderOwnerId) ?? "#f06a74") : undefined;
    if (!resolved && !unresolved) continue;
    if (unresolved?.landing && nowMs < unresolved.landing.startAt + unresolved.landing.approachMs) continue;
    const entry = resolved ?? unresolved!;
    const colors = [entry.attackerColor, entry.defenderColor] as const;
    const center = { sx: tile.px + projection.size / 2, sy: tile.py + projection.size / 2 };
    const scale = projection.size * 0.85;
    const poses = ([0, 1] as const).map((side) => Array.from({ length: MARINES_PER_SIDE }, (_, i) => {
      const start = side === 1 ? garrisonStartFor(entry.defenderGarrison, entry.hashSeed, i) : undefined;
      return resolved
        ? computeBattlePose(resolved, side, i, nowMs, side === 0 ? -0.46 : 0.46, 0, 0, 1, side === 0 ? 1 : -1, 0, undefined, start)
        : computeSkirmishPose(unresolved!, side, i, nowMs, side === 0 ? -0.46 : 0.46, 0, 0, 1, side === 0 ? 1 : -1, 0, undefined, start);
    }));
    ctx.save();
    ctx.lineWidth = Math.max(1, projection.size * 0.025);
    for (const side of [0, 1] as const) {
      if (!resolved && unresolved?.unopposed && side === 1) continue;
      ctx.strokeStyle = colors[side];
      for (let i = 0; i < MARINES_PER_SIDE; i++) {
        const pose = poses[side]![i]!;
        if (pose.scale <= 0 || pose.fallT > 0) continue;
        for (const bolt of resolved ? computeBattleBolts(resolved, side, i, nowMs) : computeSkirmishBolts(unresolved!, side, i, nowMs)) {
          const target = poses[1 - side]![bolt.targetIndex]!;
          const x = pose.localX + (target.localX - pose.localX) * bolt.progress;
          const y = pose.localZ + (target.localZ - pose.localZ) * bolt.progress;
          ctx.beginPath(); ctx.moveTo(center.sx + x * scale, center.sy + y * scale);
          ctx.lineTo(center.sx + (x - (target.localX - pose.localX) * 0.16) * scale, center.sy + (y - (target.localZ - pose.localZ) * 0.16) * scale);
          ctx.stroke();
        }
      }
      for (const pose of poses[side]!) {
        if (pose.scale <= 0) continue;
        ctx.globalAlpha = 1 - pose.fallT * 0.85;
        ctx.fillStyle = colors[side];
        ctx.beginPath();
        ctx.arc(center.sx + pose.localX * scale, center.sy + pose.localZ * scale, Math.max(0.5, projection.size * 0.035) * pose.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
};
