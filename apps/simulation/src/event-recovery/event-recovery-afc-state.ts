import { AFC_CAMPAIGN_RECORD_LIMIT, type AfcCampaignState } from "@border-empires/shared";
import type { RecoveredPlayerState } from "./event-recovery-player-state.js";

function deadlines(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0);
  if (entries.length > AFC_CAMPAIGN_RECORD_LIMIT) throw new Error("AFC recovery record limit exceeded");
  return Object.fromEntries(entries);
}
export function applyRecoveredAfcState(player: RecoveredPlayerState, payload: Record<string, unknown>): void {
  if (payload.afcRecovery && typeof payload.afcRecovery === "object") {
    const raw = payload.afcRecovery as Record<string, unknown>;
    if (typeof raw.globalLosses === "number" && Number.isSafeInteger(raw.globalLosses) && raw.globalLosses >= 0) {
      const state: import("@border-empires/shared").AfcRecoveryState = { globalLosses: raw.globalLosses };
      if (typeof raw.requiredSince === "number" && Number.isFinite(raw.requiredSince)) state.requiredSince = raw.requiredSince;
      if (typeof raw.cancellation === "string") state.cancellation = raw.cancellation.slice(0, 200);
      const pending = raw.pending;
      if (pending && typeof pending === "object") {
        const p = pending as Record<string, unknown>;
        if (typeof p.x === "number" && Number.isInteger(p.x) && typeof p.y === "number" && Number.isInteger(p.y) && typeof p.arrivesAt === "number" && Number.isFinite(p.arrivesAt) && typeof p.cost === "number" && Number.isFinite(p.cost) && p.cost >= 0 && typeof p.commandId === "string") state.pending = { x: p.x, y: p.y, arrivesAt: p.arrivesAt, cost: p.cost, commandId: p.commandId };
      }
      player.afcRecovery = state;
    }
  }
  if (payload.afcUpgradeRuleset !== "afc-v1") return;
  player.afcUpgradeRuleset = "afc-v1";
  if (Array.isArray(payload.afcCoreTownKeys) && payload.afcCoreTownKeys.length <= 3 && payload.afcCoreTownKeys.every(key => typeof key === "string" && /^\d+,\d+$/.test(key))) player.afcCoreTownKeys = [...payload.afcCoreTownKeys];
  const scarcity = payload.afcScarcityFoodSlots;
  if (typeof scarcity === "number" && Number.isFinite(scarcity) && scarcity >= 0) player.afcScarcityFoodSlots = scarcity;
  const raw = payload.afcCampaign;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const data = raw as Record<string, unknown>;
    const state: AfcCampaignState = {};
    const wards = deadlines(data.fortWardRecharges);
    if (wards) state.fortWardRecharges = wards;
    if (typeof data.forcedTruceCooldownUntil === "number" && Number.isFinite(data.forcedTruceCooldownUntil)) state.forcedTruceCooldownUntil = data.forcedTruceCooldownUntil;
    if (typeof data.freeFortsUsed === "number" && Number.isInteger(data.freeFortsUsed) && data.freeFortsUsed >= 0) state.freeFortsUsed = data.freeFortsUsed;
    if (typeof data.hijackReadyAt === "number" && Number.isFinite(data.hijackReadyAt)) state.hijackReadyAt = data.hijackReadyAt;
    player.afcCampaign = state;
  }
  if (typeof payload.gold === "number" && Number.isFinite(payload.gold)) player.points = payload.gold;
}
