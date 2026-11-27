// 2D-canvas lost-tile flash (the true-3D counterpart is
// client-battle-flash-3d.ts): a pulsing red wash and an outward ring on each
// tile you just lost, fading over BATTLE_FLASH_MS.
import { battleFlashIntensity, type BattleFlash } from "./client-battle-warnings.js";

export type BattleFlash2DDeps = {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  viewportWidth: number;
  viewportHeight: number;
  size: number;
  halfW: number;
  halfH: number;
  nowMs: number;
};

export const drawBattleFlashes2D = (flashes: readonly BattleFlash[], deps: BattleFlash2DDeps): void => {
  if (flashes.length === 0) return;
  const { ctx, size, nowMs } = deps;
  ctx.save();
  for (const flash of flashes) {
    const center = deps.worldToScreen(flash.x, flash.y, size, deps.halfW, deps.halfH);
    if (center.sx < -size || center.sy < -size || center.sx > deps.viewportWidth + size || center.sy > deps.viewportHeight + size) continue;
    const strength = battleFlashIntensity(flash, nowMs);
    if (strength <= 0.01) continue;
    const life = Math.min(1, Math.max(0, (nowMs - flash.startedAt) / Math.max(1, flash.until - flash.startedAt)));
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255, 56, 56, ${(0.42 * strength).toFixed(3)})`;
    ctx.fillRect(center.sx - size / 2, center.sy - size / 2, size, size);
    const ringRadius = size * (0.45 + life * 0.35);
    ctx.strokeStyle = `rgba(255, 110, 100, ${(0.95 * strength).toFixed(3)})`;
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath();
    ctx.arc(center.sx, center.sy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};
