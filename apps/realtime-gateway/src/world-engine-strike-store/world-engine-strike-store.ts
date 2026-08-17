// Durable log of World Engine strikes that landed on an enemy-owned town,
// kept for WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS so a player who connects or
// reconnects after the live broadcast still finds out what happened. The
// live broadcast itself (gateway-app.ts's __broadcast__ PLAYER_MESSAGE fan-out)
// is independent of this store — this only backs the history fetch.
export const WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS = 12 * 60 * 60_000;

export type WorldEngineStrikeRecord = {
  strikeId: string;
  occurredAt: number;
  casterName: string;
  targetX: number;
  targetY: number;
  townName: string;
  populationTier: string;
  populationLost: number;
  targetOwnerName: string;
};

export type WorldEngineStrikeStore = {
  insert: (record: WorldEngineStrikeRecord) => Promise<void>;
  listSince: (sinceMs: number) => Promise<WorldEngineStrikeRecord[]>;
};

const readString = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const readNumber = (payload: Record<string, unknown>, key: string): number | undefined => {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

// Parses the free-form PLAYER_MESSAGE payload the simulation emits for a
// WORLD_ENGINE_STRIKE_ANNOUNCEMENT broadcast into a durable record. Returns
// undefined on a malformed/incomplete payload so a bad event can't corrupt
// the store or crash the gateway's event loop.
export const readWorldEngineStrikeAnnouncement = (payload: Record<string, unknown>): WorldEngineStrikeRecord | undefined => {
  const strikeId = readString(payload, "strikeId");
  const occurredAt = readNumber(payload, "occurredAt");
  const targetX = readNumber(payload, "targetX");
  const targetY = readNumber(payload, "targetY");
  if (!strikeId || typeof occurredAt !== "number" || typeof targetX !== "number" || typeof targetY !== "number") return undefined;
  return {
    strikeId,
    occurredAt,
    casterName: readString(payload, "casterName") ?? "Unknown Empire",
    targetX,
    targetY,
    townName: readString(payload, "townName") ?? "",
    populationTier: readString(payload, "populationTier") ?? "TOWN",
    populationLost: readNumber(payload, "populationLost") ?? 0,
    targetOwnerName: readString(payload, "targetOwnerName") ?? "Unknown Empire"
  };
};

export class InMemoryWorldEngineStrikeStore implements WorldEngineStrikeStore {
  private readonly records: WorldEngineStrikeRecord[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  async insert(record: WorldEngineStrikeRecord): Promise<void> {
    if (this.records.some((existing) => existing.strikeId === record.strikeId)) return;
    this.records.push(record);
    const cutoff = this.now() - WORLD_ENGINE_STRIKE_HISTORY_WINDOW_MS;
    while (this.records[0] && this.records[0].occurredAt < cutoff) this.records.shift();
  }

  async listSince(sinceMs: number): Promise<WorldEngineStrikeRecord[]> {
    return this.records.filter((record) => record.occurredAt >= sinceMs).map((record) => ({ ...record }));
  }
}
