import type { RevealEmpireStatsView, SurveySweepPingKind } from "../client-types.js";

const revealStatsNumberKeys = [
  "revealedAt",
  "tiles",
  "settledTiles",
  "frontierTiles",
  "controlledTowns",
  "incomePerMinute",
  "techCount",
  "gold",
  "manpower",
  "manpowerCap"
] as const;
const revealStatsResourceKeys = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

const isSurveySweepPingKind = (value: unknown): value is SurveySweepPingKind =>
  value === "resource" || value === "town";

export const surveySweepPingsFromPayload = (value: unknown): Array<{ x: number; y: number; kind: SurveySweepPingKind }> => {
  if (!Array.isArray(value)) return [];
  const out: Array<{ x: number; y: number; kind: SurveySweepPingKind }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.x !== "number" || typeof entry.y !== "number" || !isSurveySweepPingKind(entry.kind)) continue;
    out.push({ x: entry.x, y: entry.y, kind: entry.kind });
  }
  return out;
};

export const isRevealEmpireStatsView = (value: unknown): value is RevealEmpireStatsView => {
  if (!isRecord(value)) return false;
  if (typeof value.playerId !== "string" || typeof value.playerName !== "string") return false;
  for (const key of revealStatsNumberKeys) {
    if (typeof value[key] !== "number") return false;
  }
  if (!isRecord(value.strategicResources)) return false;
  for (const key of revealStatsResourceKeys) {
    if (typeof value.strategicResources[key] !== "number") return false;
  }
  return true;
};
