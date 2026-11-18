// The persisted shape of one AI's memory of one player (ai-diplomacy-memory.ts),
// shared by the memory and the gateway social store
// (social-store-ai-diplomacy-memory.ts). Fading values are stored raw, as
// {value, at}: decay keeps running from `at` after a restart, so no rewrite is
// needed on load.

/** Tiles and fights fade by half every 12 hours. */
export const WAR_MEMORY_HALF_LIFE_MS = 12 * 60 * 60_000;
/**
 * The war's pace: the same tile counts fading by half every hour, so they hold
 * roughly the last hour and a half of fighting (ai-war-outlook.ts).
 */
export const WAR_PACE_HALF_LIFE_MS = 60 * 60_000;
/** Goodwill from payments and the "you keep buying truces" count fade by half daily. */
export const DEAL_MEMORY_HALF_LIFE_MS = 24 * 60 * 60_000;
/** Pairs remembered at once (state discipline); the least recently touched is forgotten first. */
export const MAX_DIPLOMACY_MEMORY_PAIRS = 20_000;
/** A fading value below this reads as forgotten: a pair whose values are all below it may be dropped. */
export const DIPLOMACY_MEMORY_EPSILON = 0.01;
/**
 * How long the last-attack / last-combat / paid-for-peace times are kept after
 * they happen. Their longest reader looks back 24h (ai-diplomacy-opinion.ts's
 * "You attacked us", ai-war-outlook.ts's once-a-day suing).
 */
export const DIPLOMACY_MEMORY_TIMESTAMP_RETENTION_MS = 24 * 60 * 60_000;

export type Decaying = { value: number; at: number };

/** Every fading field and its half-life; the store keeps one value/at column pair per field. */
export const DECAYING_MEMORY_FIELDS = [
  ["tilesTakenFromAi", WAR_MEMORY_HALF_LIFE_MS],
  ["tilesTakenByAi", WAR_MEMORY_HALF_LIFE_MS],
  ["recentTilesTakenFromAi", WAR_PACE_HALF_LIFE_MS],
  ["recentTilesTakenByAi", WAR_PACE_HALF_LIFE_MS],
  ["battles", WAR_MEMORY_HALF_LIFE_MS],
  ["truceDeals", DEAL_MEMORY_HALF_LIFE_MS],
  ["goodwillCoin", DEAL_MEMORY_HALF_LIFE_MS]
] as const;

export type DecayingMemoryField = (typeof DECAYING_MEMORY_FIELDS)[number][0];

export type PairMemoryValues = Record<DecayingMemoryField, Decaying> & {
  lastPlayerAttackAt: number | undefined;
  lastCombatAt: number | undefined;
  /** When the AI last paid this player for peace; it won't again until they fight anew. */
  aiPaidForPeaceAt: number | undefined;
};

/** One stored row: the raw memory plus when it was last touched (LRU order) and when it fades out. */
export type StoredDiplomacyMemoryPair = PairMemoryValues & {
  aiPlayerId: string;
  playerId: string;
  touchedAt: number;
  /** After this every fading value is below DIPLOMACY_MEMORY_EPSILON and every timestamp is past its retention. */
  expiresAt: number;
};

export const diplomacyMemoryPairKey = (aiPlayerId: string, playerId: string): string => `${aiPlayerId}|${playerId}`;

/** When a fading value drops below DIPLOMACY_MEMORY_EPSILON (its own `at` if it already has). */
const fadesOutAt = (entry: Decaying, halfLifeMs: number): number =>
  entry.value <= DIPLOMACY_MEMORY_EPSILON ? entry.at : entry.at + Math.ceil(halfLifeMs * Math.log2(entry.value / DIPLOMACY_MEMORY_EPSILON));

/** The time after which this memory holds nothing worth keeping (see StoredDiplomacyMemoryPair.expiresAt). */
export const diplomacyMemoryExpiresAt = (memory: PairMemoryValues): number => {
  let expiresAt = 0;
  for (const [field, halfLifeMs] of DECAYING_MEMORY_FIELDS) expiresAt = Math.max(expiresAt, fadesOutAt(memory[field], halfLifeMs));
  for (const at of [memory.lastPlayerAttackAt, memory.lastCombatAt, memory.aiPaidForPeaceAt]) {
    if (at !== undefined) expiresAt = Math.max(expiresAt, at + DIPLOMACY_MEMORY_TIMESTAMP_RETENTION_MS);
  }
  return expiresAt;
};
