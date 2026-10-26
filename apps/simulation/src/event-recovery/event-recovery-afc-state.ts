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
  if (payload.afcUpgradeRuleset !== "afc-v1") return;
  player.afcUpgradeRuleset = "afc-v1";
  if (Array.isArray(payload.afcCoreTownKeys) && payload.afcCoreTownKeys.length <= 3 && payload.afcCoreTownKeys.every(key => typeof key === "string" && /^\d+,\d+$/.test(key))) player.afcCoreTownKeys = [...payload.afcCoreTownKeys];
  const scarcity = payload.afcScarcityFoodSlots;
  if (typeof scarcity === "number" && Number.isFinite(scarcity) && scarcity >= 0) player.afcScarcityFoodSlots = scarcity;
  const raw = payload.afcCampaign;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const data = raw as Record<string, unknown>;
    const state: AfcCampaignState = {};
    const wards = deadlines(data.fortWardRecharges), wars = deadlines(data.wars);
    if (wards) state.fortWardRecharges = wards;
    if (wars) state.wars = wars;
    if (typeof data.forcedTruceCooldownUntil === "number" && Number.isFinite(data.forcedTruceCooldownUntil)) state.forcedTruceCooldownUntil = data.forcedTruceCooldownUntil;
    player.afcCampaign = state;
  }
  if (typeof payload.gold === "number" && Number.isFinite(payload.gold)) player.points = payload.gold;
}
