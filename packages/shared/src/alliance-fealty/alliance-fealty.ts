// Who an alliance (or an alliance offer) names as liege, recorded when the
// offer is sent and carried onto the alliance it forms (owner decision
// 2026-11-27). Unequal alliances read as fealty (packages/client
// client-fealty.ts), but the wording must not change after the fact: a polite
// offer to a House that later shrank must not start reading "Fealty demanded".
// So the realtime gateway records the standing at send time, persists it, and
// every list, bar, status and Chronicle row reads the record. An offer or
// alliance from before the record existed has none and reads plain "Alliance".

/** One side has at least this many times the other's garrisoned tiles. */
export const FEALTY_SIZE_RATIO = 2;

/** The pair's recorded standing: liegePlayerId is the clearly larger House, null for near-equals. */
export type AllianceFealty = { liegePlayerId: string | null };

/**
 * The standing between two Houses from their garrisoned (leaderboard) tile
 * counts. A size that isn't known reads as near-equals.
 */
export const allianceFealtyFromTiles = (
  a: { id: string; tiles: number | undefined },
  b: { id: string; tiles: number | undefined }
): AllianceFealty => {
  if (a.tiles === undefined || b.tiles === undefined) return { liegePlayerId: null };
  if (a.tiles > 0 && a.tiles >= b.tiles * FEALTY_SIZE_RATIO) return { liegePlayerId: a.id };
  if (b.tiles > 0 && b.tiles >= a.tiles * FEALTY_SIZE_RATIO) return { liegePlayerId: b.id };
  return { liegePlayerId: null };
};

/** A stored or received record, or undefined when it is missing or malformed (an older offer). */
export const parseAllianceFealty = (value: unknown): AllianceFealty | undefined => {
  if (typeof value !== "object" || value === null || !("liegePlayerId" in value)) return undefined;
  const liege = (value as { liegePlayerId: unknown }).liegePlayerId;
  return liege === null || typeof liege === "string" ? { liegePlayerId: liege } : undefined;
};
