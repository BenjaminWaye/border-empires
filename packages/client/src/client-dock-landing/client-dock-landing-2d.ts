import type { ClientState } from "../client-state/client-state.js";
import { collectBattleRenderEntries } from "../client-map-3d-capture-overlays.js";
import { computeBattlePose, computeSkirmishPose, MARINES_PER_SIDE, clampLocal } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import { landingCarrierPose, landingMarinePose } from "./client-dock-landing.js";

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

/** Lightweight canvas counterpart: the same boat, ramp, unloading and battle clock. */
export function drawDockLandings2D(
  state: ClientState, keyFor: (x: number, y: number) => string, worldToScreen: WorldToScreen,
  ctx: CanvasRenderingContext2D, colorFor: (ownerId: string) => string,
  size: number, halfW: number, halfH: number, nowMs: number
): void {
  const { entries, skirmishes } = collectBattleRenderEntries(state, keyFor, colorFor, () => 0, 0, 0, nowMs);
  for (const b of [...entries, ...skirmishes].slice(0, 16)) {
    if (!b.landing) continue;
    const landing = b.landing;
    const carrier = landingCarrierPose(landing, nowMs);
    const target = worldToScreen(b.tgtWorldX - 0.5, b.tgtWorldZ - 0.5, size, halfW, halfH);
    ctx.save(); ctx.translate(target.sx, target.sy); ctx.scale(size, size);
    ctx.save(); ctx.translate(carrier.x, carrier.z); ctx.rotate(-carrier.yaw);
    ctx.fillStyle = "#17222b"; ctx.fillRect(-0.23, -0.34, 0.46, 0.66);
    ctx.fillStyle = "#576b78";
    ctx.fillRect(-0.26, -0.34, 0.11, 0.67); ctx.fillRect(0.15, -0.34, 0.11, 0.67);
    ctx.fillRect(-0.17, -0.30, 0.34, 0.16);
    ctx.fillStyle = b.attackerColor;
    ctx.fillRect(-0.245, -0.22, 0.08, 0.28); ctx.fillRect(0.165, -0.22, 0.08, 0.28);
    ctx.fillStyle = "#91a5b0";
    ctx.fillRect(-0.15, 0.30, 0.30, 0.02 + 0.22 * carrier.rampOpen);
    ctx.restore();
    const ux = landing.inwardX; const uz = landing.inwardZ;
    for (const side of [0, 1] as const) {
      const forward = side === 0 ? 1 : -1;
      for (let i = 0; i < MARINES_PER_SIDE; i++) {
        const args = [side, i, nowMs, -forward * ux * 0.46, -forward * uz * 0.46, -uz, ux, forward * ux, forward * uz] as const;
        const raw = "clashAt" in b ? computeBattlePose(b, ...args) : computeSkirmishPose(b, ...args);
        const clamped = { ...raw, localX: clampLocal(raw.localX), localZ: clampLocal(raw.localZ) };
        const pose = side === 0 ? landingMarinePose(clamped, landing, i, nowMs, b.hashSeed) : clamped;
        if (pose.scale <= 0) continue;
        ctx.globalAlpha = pose.scale * (1 - pose.fallT);
        ctx.fillStyle = side === 0 ? b.attackerColor : b.defenderColor;
        ctx.beginPath(); ctx.arc(pose.localX, pose.localZ, 0.025, 0, Math.PI * 2); ctx.fill();
        if (pose.flash > 0) {
          ctx.strokeStyle = "#fff4b0"; ctx.lineWidth = 0.012;
          ctx.beginPath(); ctx.moveTo(pose.localX, pose.localZ);
          ctx.lineTo(pose.localX + forward * ux * 0.16, pose.localZ + forward * uz * 0.16); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}
