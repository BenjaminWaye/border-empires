import type { RelicResource } from "./relic-catalog.js";

/**
 * RELIC (the anonymous standby transponder) and RESOURCE deliberately exclude
 * ownership, installation type, reserves and terrain. WAKE is an operating
 * relic's aether wake, seen by every other House: its location and the House
 * operating it, never its type or reserves.
 */
export type RelicMapHint =
  | { x: number; y: number; kind: "RELIC" }
  | { x: number; y: number; kind: "RESOURCE"; resource: RelicResource }
  | { x: number; y: number; kind: "WAKE"; ownerId: string };
export const RELIC_MAP_HINT_LIMIT = 4096;
export function parseRelicMapHints(value: unknown): RelicMapHint[] {
  if (!Array.isArray(value) || value.length > RELIC_MAP_HINT_LIMIT) return [];
  const result: RelicMapHint[] = [];
  for (const raw of value) {
    const item: unknown = raw;
    if (!item || typeof item !== "object" || !("x" in item) || !("y" in item) || !("kind" in item)) continue;
    const { x, y, kind } = item;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (kind === "RELIC") result.push({ x, y, kind });
    else if (kind === "WAKE" && "ownerId" in item) {
      const ownerId = item.ownerId;
      if (typeof ownerId === "string" && ownerId.length > 0 && ownerId.length <= 128) result.push({ x, y, kind, ownerId });
    }
    else if (kind === "RESOURCE" && "resource" in item) {
      const resource = item.resource;
      if (resource === "TITANIUM" || resource === "CRYSTAL" || resource === "UMBRITE") result.push({ x, y, kind, resource });
    }
  }
  return result;
}
