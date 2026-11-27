// What each AI remembers about each player, Civ-style: grievances and
// goodwill that fade over time rather than a snapshot of the moment. Fed by
// combat results from the simulation event stream and by settled deals.
//
// Bounded (MAX_DIPLOMACY_MEMORY_PAIRS, least recently touched forgotten first)
// and persisted per pair in the gateway social store through `sink`
// (social-store-ai-diplomacy-memory.ts), so a restart keeps the war tally,
// pricing and "already paid for peace". Values are stored raw and keep fading
// from their own timestamps; a pair whose values have all faded is pruned
// (`prune`). Scoped to the season: the store and `reset` clear it at a new one.

import {
  DEAL_MEMORY_HALF_LIFE_MS,
  diplomacyMemoryExpiresAt,
  diplomacyMemoryPairKey,
  MAX_DIPLOMACY_MEMORY_PAIRS,
  WAR_MEMORY_HALF_LIFE_MS,
  WAR_PACE_HALF_LIFE_MS,
  type Decaying,
  type StoredDiplomacyMemoryPair
} from "./ai-diplomacy-memory-record.js";

export { DEAL_MEMORY_HALF_LIFE_MS, MAX_DIPLOMACY_MEMORY_PAIRS, WAR_MEMORY_HALF_LIFE_MS, WAR_PACE_HALF_LIFE_MS } from "./ai-diplomacy-memory-record.js";
export type { StoredDiplomacyMemoryPair } from "./ai-diplomacy-memory-record.js";

type PairMemory = StoredDiplomacyMemoryPair;

/** Where changed pairs go: upsert on every change, remove on eviction or prune. */
export type DiplomacyMemorySink = {
  save: (pair: StoredDiplomacyMemoryPair) => void;
  remove: (aiPlayerId: string, playerId: string) => void;
};

export type DiplomacyMemoryView = {
  tilesTakenFromAi: number;
  tilesTakenByAi: number;
  /** Tiles taken either way over roughly the last hour and a half; absent from older test fixtures (read as 0). */
  recentTilesTakenFromAi?: number;
  recentTilesTakenByAi?: number;
  battles: number;
  truceDeals: number;
  goodwillCoin: number;
  lastPlayerAttackAt: number | undefined;
  lastCombatAt: number | undefined;
  /** The AI paid for peace and there has been no fighting since. */
  aiAlreadyPaidThisWar: boolean;
  /** When the AI last paid this player for peace (ai-war-outlook.ts limits suing to once a day); absent from older fixtures. */
  aiPaidForPeaceAt?: number;
  /** This pair has made a truce deal since the memory was kept (truceDeals fades; this doesn't). */
  everMadeTruce?: boolean;
};

const decayed = (entry: Decaying, now: number, halfLifeMs: number): number =>
  entry.value * Math.pow(0.5, Math.max(0, now - entry.at) / halfLifeMs);

const bump = (entry: Decaying, amount: number, now: number, halfLifeMs: number): Decaying => ({
  value: decayed(entry, now, halfLifeMs) + amount,
  at: now
});

const empty = (aiPlayerId: string, playerId: string, now: number): PairMemory => ({
  aiPlayerId,
  playerId,
  touchedAt: now,
  expiresAt: now,
  tilesTakenFromAi: { value: 0, at: now },
  tilesTakenByAi: { value: 0, at: now },
  recentTilesTakenFromAi: { value: 0, at: now },
  recentTilesTakenByAi: { value: 0, at: now },
  battles: { value: 0, at: now },
  truceDeals: { value: 0, at: now },
  goodwillCoin: { value: 0, at: now },
  lastPlayerAttackAt: undefined,
  lastCombatAt: undefined,
  aiPaidForPeaceAt: undefined
});

export type CombatObservation = {
  attackerId: string;
  defenderId: string;
  attackerWon: boolean;
  /** Tiles that changed hands to the attacker in this fight. */
  tilesCaptured: number;
  /**
   * Tiles that changed hands to the defender: a failed attack loses its origin
   * tile to them (runtime-lock-resolution-lost-origin.ts). The Chronicle's
   * flip log counts that tile, so the war tally must too.
   */
  tilesCapturedByDefender?: number;
};

export type AiDiplomacyMemory = {
  observeCombat: (combat: CombatObservation) => void;
  recordTruceDeal: (aiPlayerId: string, playerId: string) => void;
  /** Coin-equivalent the player paid the AI (positive) or the AI paid the player (negative). */
  recordPayment: (aiPlayerId: string, playerId: string, coinToAi: number) => void;
  view: (aiPlayerId: string, playerId: string) => DiplomacyMemoryView;
  /** Forgets pairs whose values have all faded (expiresAt passed); returns how many. */
  prune: () => number;
  /** Forgets everything without touching the sink (a new season; the store clears its own rows). */
  reset: () => void;
  size: () => number;
  /** Gauge and counters for the state-discipline bound: pairs held, evicted at the cap, pruned. */
  stats: () => { pairs: number; evictedTotal: number; prunedTotal: number };
};

export const createAiDiplomacyMemory = (deps: {
  now: () => number;
  isAi: (playerId: string) => boolean;
  /** Pairs restored from the social store at boot. */
  initial?: readonly StoredDiplomacyMemoryPair[];
  sink?: DiplomacyMemorySink;
}): AiDiplomacyMemory => {
  const pairs = new Map<string, PairMemory>();
  let evictedTotal = 0;
  let prunedTotal = 0;
  const forget = (key: string): void => {
    const entry = pairs.get(key);
    if (!entry) return;
    pairs.delete(key);
    deps.sink?.remove(entry.aiPlayerId, entry.playerId);
  };
  const evictToFit = (): void => {
    while (pairs.size >= MAX_DIPLOMACY_MEMORY_PAIRS) {
      const oldestKey = pairs.keys().next().value;
      if (oldestKey === undefined) return;
      forget(oldestKey);
      evictedTotal += 1;
    }
  };
  // LRU by Map insertion order: a touched pair is moved to the end, so the
  // first key is always the least recently touched (O(1) eviction).
  const touch = (aiPlayerId: string, playerId: string): PairMemory => {
    const now = deps.now();
    const key = diplomacyMemoryPairKey(aiPlayerId, playerId);
    let entry = pairs.get(key);
    if (entry) {
      pairs.delete(key);
    } else {
      evictToFit();
      entry = empty(aiPlayerId, playerId, now);
    }
    entry.touchedAt = now;
    pairs.set(key, entry);
    return entry;
  };
  /** Called after every change to a touched pair: refreshes its fade-out time and hands it to the store. */
  const commit = (entry: PairMemory): void => {
    entry.expiresAt = diplomacyMemoryExpiresAt(entry);
    deps.sink?.save({ ...entry });
  };
  const loadNow = deps.now();
  for (const stored of [...(deps.initial ?? [])].sort((left, right) => left.touchedAt - right.touchedAt)) {
    if (stored.expiresAt <= loadNow) {
      deps.sink?.remove(stored.aiPlayerId, stored.playerId);
      prunedTotal += 1;
      continue;
    }
    const key = diplomacyMemoryPairKey(stored.aiPlayerId, stored.playerId);
    if (pairs.has(key)) pairs.delete(key);
    else evictToFit();
    pairs.set(key, { ...stored });
  }

  return {
    observeCombat: ({ attackerId, defenderId, attackerWon, tilesCaptured, tilesCapturedByDefender }) => {
      if (!attackerId || !defenderId || attackerId === defenderId) return;
      const now = deps.now();
      const captured = attackerWon ? Math.max(0, tilesCaptured) : 0;
      const recaptured = attackerWon ? 0 : Math.max(0, tilesCapturedByDefender ?? 0);
      // Remember from each AI's point of view; human-vs-human fights need no AI memory.
      if (deps.isAi(defenderId)) {
        const entry = touch(defenderId, attackerId);
        entry.tilesTakenFromAi = bump(entry.tilesTakenFromAi, captured, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.recentTilesTakenFromAi = bump(entry.recentTilesTakenFromAi, captured, now, WAR_PACE_HALF_LIFE_MS);
        if (recaptured > 0) {
          entry.tilesTakenByAi = bump(entry.tilesTakenByAi, recaptured, now, WAR_MEMORY_HALF_LIFE_MS);
          entry.recentTilesTakenByAi = bump(entry.recentTilesTakenByAi, recaptured, now, WAR_PACE_HALF_LIFE_MS);
        }
        entry.battles = bump(entry.battles, 1, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.lastPlayerAttackAt = now;
        entry.lastCombatAt = now;
        commit(entry);
      }
      if (deps.isAi(attackerId)) {
        const entry = touch(attackerId, defenderId);
        entry.tilesTakenByAi = bump(entry.tilesTakenByAi, captured, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.recentTilesTakenByAi = bump(entry.recentTilesTakenByAi, captured, now, WAR_PACE_HALF_LIFE_MS);
        if (recaptured > 0) {
          entry.tilesTakenFromAi = bump(entry.tilesTakenFromAi, recaptured, now, WAR_MEMORY_HALF_LIFE_MS);
          entry.recentTilesTakenFromAi = bump(entry.recentTilesTakenFromAi, recaptured, now, WAR_PACE_HALF_LIFE_MS);
        }
        entry.battles = bump(entry.battles, 1, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.lastCombatAt = now;
        commit(entry);
      }
    },
    recordTruceDeal: (aiPlayerId, playerId) => {
      const entry = touch(aiPlayerId, playerId);
      entry.truceDeals = bump(entry.truceDeals, 1, deps.now(), DEAL_MEMORY_HALF_LIFE_MS);
      commit(entry);
    },
    recordPayment: (aiPlayerId, playerId, coinToAi) => {
      const entry = touch(aiPlayerId, playerId);
      const now = deps.now();
      if (coinToAi > 0) entry.goodwillCoin = bump(entry.goodwillCoin, coinToAi, now, DEAL_MEMORY_HALF_LIFE_MS);
      if (coinToAi < 0) entry.aiPaidForPeaceAt = now;
      commit(entry);
    },
    view: (aiPlayerId, playerId) => {
      const entry = pairs.get(diplomacyMemoryPairKey(aiPlayerId, playerId));
      const now = deps.now();
      if (!entry) {
        return {
          tilesTakenFromAi: 0,
          tilesTakenByAi: 0,
          recentTilesTakenFromAi: 0,
          recentTilesTakenByAi: 0,
          battles: 0,
          truceDeals: 0,
          goodwillCoin: 0,
          lastPlayerAttackAt: undefined,
          lastCombatAt: undefined,
          aiAlreadyPaidThisWar: false,
          everMadeTruce: false
        };
      }
      return {
        tilesTakenFromAi: decayed(entry.tilesTakenFromAi, now, WAR_MEMORY_HALF_LIFE_MS),
        tilesTakenByAi: decayed(entry.tilesTakenByAi, now, WAR_MEMORY_HALF_LIFE_MS),
        recentTilesTakenFromAi: decayed(entry.recentTilesTakenFromAi, now, WAR_PACE_HALF_LIFE_MS),
        recentTilesTakenByAi: decayed(entry.recentTilesTakenByAi, now, WAR_PACE_HALF_LIFE_MS),
        battles: decayed(entry.battles, now, WAR_MEMORY_HALF_LIFE_MS),
        truceDeals: decayed(entry.truceDeals, now, DEAL_MEMORY_HALF_LIFE_MS),
        goodwillCoin: decayed(entry.goodwillCoin, now, DEAL_MEMORY_HALF_LIFE_MS),
        lastPlayerAttackAt: entry.lastPlayerAttackAt,
        lastCombatAt: entry.lastCombatAt,
        aiAlreadyPaidThisWar: entry.aiPaidForPeaceAt !== undefined && (entry.lastCombatAt === undefined || entry.lastCombatAt <= entry.aiPaidForPeaceAt),
        everMadeTruce: entry.truceDeals.value > 0,
        ...(entry.aiPaidForPeaceAt !== undefined ? { aiPaidForPeaceAt: entry.aiPaidForPeaceAt } : {})
      };
    },
    prune: () => {
      const now = deps.now();
      let pruned = 0;
      for (const [key, entry] of pairs) {
        if (entry.expiresAt > now) continue;
        forget(key);
        pruned += 1;
      }
      prunedTotal += pruned;
      return pruned;
    },
    reset: () => pairs.clear(),
    size: () => pairs.size,
    stats: () => ({ pairs: pairs.size, evictedTotal, prunedTotal })
  };
};

/** Reads a combat out of a simulation COMBAT_RESOLVED event, if it was between two players. */
export const combatFromSimulationEvent = (event: {
  eventType: string;
  playerId?: string;
  attackerWon?: boolean;
  combatResult?: { defenderOwnerId?: string; changes?: Array<{ ownerId?: string }> };
}): CombatObservation | undefined => {
  if (event.eventType !== "COMBAT_RESOLVED" || !event.playerId) return undefined;
  const defenderId = event.combatResult?.defenderOwnerId;
  if (!defenderId || defenderId.startsWith("barbarian")) return undefined;
  const attackerId = event.playerId;
  const changes = event.combatResult?.changes ?? [];
  const tilesCapturedByDefender = changes.filter((change) => change.ownerId === defenderId).length;
  return {
    attackerId,
    defenderId,
    attackerWon: event.attackerWon === true,
    tilesCaptured: changes.filter((change) => change.ownerId === attackerId).length,
    ...(tilesCapturedByDefender > 0 ? { tilesCapturedByDefender } : {})
  };
};
