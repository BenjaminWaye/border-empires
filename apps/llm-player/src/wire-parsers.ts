// Defensive readers for gateway wire payloads. INIT and PLAYER_UPDATE have no
// shared exported runtime schema (they're assembled ad hoc by apps/realtime-
// gateway), so each field is validated by hand instead of cast. Split out of
// game-socket.ts to keep that file under the repo's 500-line cap.
import type { SlotResource } from "@border-empires/shared";
import type { EventLogEntry, ResourceSlots } from "./game-socket.js";

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const tileKey = (x: number, y: number): string => `${x},${y}`;

// A fresh object per call so no caller can mutate a shared fallback.
const emptyResourceSlots = (): ResourceSlots => ({
  supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
});

export const asAutoSettlementQueue = (value: unknown): Array<{ x: number; y: number }> => {
  if (!Array.isArray(value)) return [];
  const entries: Array<{ x: number; y: number }> = [];
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.x === "number" && typeof entry.y === "number") entries.push({ x: entry.x, y: entry.y });
  }
  return entries;
};

export const asTechIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

const asSlotRecord = (value: unknown): Record<SlotResource, number> => {
  if (!isRecord(value)) return { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const at = (key: SlotResource): number => (typeof value[key] === "number" ? (value[key] as number) : 0);
  return { FOOD: at("FOOD"), TITANIUM: at("TITANIUM"), CRYSTAL: at("CRYSTAL"), UMBRITE: at("UMBRITE") };
};

export const asResourceSlots = (value: unknown): ResourceSlots => {
  if (!isRecord(value)) return emptyResourceSlots();
  return { supply: asSlotRecord(value.supply), demand: asSlotRecord(value.demand) };
};

export const asEventLogEntry = (value: unknown): EventLogEntry | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.text !== "string" ||
    typeof value.occurredAt !== "number"
  ) {
    return undefined;
  }
  const x = typeof value.x === "number" ? value.x : undefined;
  const y = typeof value.y === "number" ? value.y : undefined;
  return {
    id: value.id,
    type: value.type,
    text: value.text,
    occurredAt: value.occurredAt,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {})
  };
};
