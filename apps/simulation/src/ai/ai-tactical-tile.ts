import type { EconomicStructureType } from "@border-empires/shared";

export type AiTacticalTileFields = {
  observatory?: { ownerId?: string; status?: string; cooldownUntil?: number | undefined; suppressedUntil?: number | undefined; siphon?: { targetX: number; targetY: number } | undefined } | null | undefined;
  economicStructure?: { ownerId?: string; type?: EconomicStructureType; status?: string; disabledUntil?: number | undefined; inactiveReason?: string | undefined } | null | undefined;
  muster?: { ownerId?: string; amount?: number } | undefined;
  sabotage?: { ownerId?: string; endsAt?: number } | undefined;
};

export function parsePlannerObservatory(raw: string | undefined): AiTacticalTileFields["observatory"] {
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as { ownerId?: unknown; status?: unknown; cooldownUntil?: unknown; suppressedUntil?: unknown; siphon?: { targetX?: unknown; targetY?: unknown } };
    return {
      ...(typeof data.ownerId === "string" ? { ownerId: data.ownerId } : {}),
      ...(typeof data.status === "string" ? { status: data.status } : {}),
      ...(typeof data.suppressedUntil === "number" ? { suppressedUntil: data.suppressedUntil } : {}),
      ...(typeof data.cooldownUntil === "number" ? { cooldownUntil: data.cooldownUntil } : {}),
      ...(data.siphon && typeof data.siphon.targetX === "number" && typeof data.siphon.targetY === "number"
        ? { siphon: { targetX: data.siphon.targetX, targetY: data.siphon.targetY } } : {})
    };
  } catch { return undefined; }
}

export function parsePlannerMuster(raw: string | undefined): AiTacticalTileFields["muster"] {
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as { ownerId?: unknown; amount?: unknown };
    return { ...(typeof data.ownerId === "string" ? { ownerId: data.ownerId } : {}),
      ...(typeof data.amount === "number" ? { amount: data.amount } : {}) };
  } catch { return undefined; }
}

export function parsePlannerSabotage(raw: string | undefined): AiTacticalTileFields["sabotage"] {
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as { ownerId?: unknown; endsAt?: unknown };
    return { ...(typeof data.ownerId === "string" ? { ownerId: data.ownerId } : {}),
      ...(typeof data.endsAt === "number" ? { endsAt: data.endsAt } : {}) };
  } catch { return undefined; }
}
