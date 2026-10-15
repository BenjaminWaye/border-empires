// What each AI remembers about each player, Civ-style: grievances and
// goodwill that fade over time rather than a snapshot of the moment. Fed by
// combat results from the simulation event stream and by settled deals.
//
// In memory only and bounded: a restart forgets recent fights, which at worst
// makes an AI briefly more forgiving. Season-long grudges (broken truces)
// live in the persisted social store, not here.

/** Tiles and fights fade by half every 12 hours. */
export const WAR_MEMORY_HALF_LIFE_MS = 12 * 60 * 60_000;
/** Goodwill from payments and the "you keep buying truces" count fade by half daily. */
export const DEAL_MEMORY_HALF_LIFE_MS = 24 * 60 * 60_000;
/** Pairs remembered at once (state discipline); the least recently touched is forgotten first. */
export const MAX_DIPLOMACY_MEMORY_PAIRS = 20_000;

type Decaying = { value: number; at: number };

type PairMemory = {
  /** Tiles the player took from the AI. */
  tilesTakenFromAi: Decaying;
  /** Tiles the AI took from the player. */
  tilesTakenByAi: Decaying;
  /** Battles between them, either direction. */
  battles: Decaying;
  /** Truces the player has bought or agreed with this AI. */
  truceDeals: Decaying;
  /** Coin-equivalent the player has paid this AI in deals. */
  goodwillCoin: Decaying;
  lastPlayerAttackAt: number | undefined;
  lastCombatAt: number | undefined;
  /** When the AI last paid this player for peace; it won't again until they fight anew. */
  aiPaidForPeaceAt: number | undefined;
};

export type DiplomacyMemoryView = {
  tilesTakenFromAi: number;
  tilesTakenByAi: number;
  battles: number;
  truceDeals: number;
  goodwillCoin: number;
  lastPlayerAttackAt: number | undefined;
  lastCombatAt: number | undefined;
  /** The AI paid for peace and there has been no fighting since. */
  aiAlreadyPaidThisWar: boolean;
};

const decayed = (entry: Decaying, now: number, halfLifeMs: number): number =>
  entry.value * Math.pow(0.5, Math.max(0, now - entry.at) / halfLifeMs);

const bump = (entry: Decaying, amount: number, now: number, halfLifeMs: number): Decaying => ({
  value: decayed(entry, now, halfLifeMs) + amount,
  at: now
});

const empty = (now: number): PairMemory => ({
  tilesTakenFromAi: { value: 0, at: now },
  tilesTakenByAi: { value: 0, at: now },
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
};

export type AiDiplomacyMemory = {
  observeCombat: (combat: CombatObservation) => void;
  recordTruceDeal: (aiPlayerId: string, playerId: string) => void;
  /** Coin-equivalent the player paid the AI (positive) or the AI paid the player (negative). */
  recordPayment: (aiPlayerId: string, playerId: string, coinToAi: number) => void;
  view: (aiPlayerId: string, playerId: string) => DiplomacyMemoryView;
  size: () => number;
};

export const createAiDiplomacyMemory = (deps: { now: () => number; isAi: (playerId: string) => boolean }): AiDiplomacyMemory => {
  const pairs = new Map<string, PairMemory>();
  const keyOf = (aiPlayerId: string, playerId: string): string => `${aiPlayerId}|${playerId}`;
  // LRU by Map insertion order: a touched pair is moved to the end, so the
  // first key is always the least recently touched (O(1) eviction).
  const touch = (aiPlayerId: string, playerId: string): PairMemory => {
    const now = deps.now();
    const key = keyOf(aiPlayerId, playerId);
    let entry = pairs.get(key);
    if (entry) {
      pairs.delete(key);
    } else {
      if (pairs.size >= MAX_DIPLOMACY_MEMORY_PAIRS) {
        const oldestKey = pairs.keys().next().value;
        if (oldestKey !== undefined) pairs.delete(oldestKey);
      }
      entry = empty(now);
    }
    pairs.set(key, entry);
    return entry;
  };

  return {
    observeCombat: ({ attackerId, defenderId, attackerWon, tilesCaptured }) => {
      if (!attackerId || !defenderId || attackerId === defenderId) return;
      const now = deps.now();
      const captured = attackerWon ? Math.max(0, tilesCaptured) : 0;
      // Remember from each AI's point of view; human-vs-human fights need no AI memory.
      if (deps.isAi(defenderId)) {
        const entry = touch(defenderId, attackerId);
        entry.tilesTakenFromAi = bump(entry.tilesTakenFromAi, captured, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.battles = bump(entry.battles, 1, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.lastPlayerAttackAt = now;
        entry.lastCombatAt = now;
      }
      if (deps.isAi(attackerId)) {
        const entry = touch(attackerId, defenderId);
        entry.tilesTakenByAi = bump(entry.tilesTakenByAi, captured, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.battles = bump(entry.battles, 1, now, WAR_MEMORY_HALF_LIFE_MS);
        entry.lastCombatAt = now;
      }
    },
    recordTruceDeal: (aiPlayerId, playerId) => {
      const entry = touch(aiPlayerId, playerId);
      entry.truceDeals = bump(entry.truceDeals, 1, deps.now(), DEAL_MEMORY_HALF_LIFE_MS);
    },
    recordPayment: (aiPlayerId, playerId, coinToAi) => {
      const entry = touch(aiPlayerId, playerId);
      const now = deps.now();
      if (coinToAi > 0) entry.goodwillCoin = bump(entry.goodwillCoin, coinToAi, now, DEAL_MEMORY_HALF_LIFE_MS);
      if (coinToAi < 0) entry.aiPaidForPeaceAt = now;
    },
    view: (aiPlayerId, playerId) => {
      const entry = pairs.get(keyOf(aiPlayerId, playerId));
      const now = deps.now();
      if (!entry) {
        return {
          tilesTakenFromAi: 0,
          tilesTakenByAi: 0,
          battles: 0,
          truceDeals: 0,
          goodwillCoin: 0,
          lastPlayerAttackAt: undefined,
          lastCombatAt: undefined,
          aiAlreadyPaidThisWar: false
        };
      }
      return {
        tilesTakenFromAi: decayed(entry.tilesTakenFromAi, now, WAR_MEMORY_HALF_LIFE_MS),
        tilesTakenByAi: decayed(entry.tilesTakenByAi, now, WAR_MEMORY_HALF_LIFE_MS),
        battles: decayed(entry.battles, now, WAR_MEMORY_HALF_LIFE_MS),
        truceDeals: decayed(entry.truceDeals, now, DEAL_MEMORY_HALF_LIFE_MS),
        goodwillCoin: decayed(entry.goodwillCoin, now, DEAL_MEMORY_HALF_LIFE_MS),
        lastPlayerAttackAt: entry.lastPlayerAttackAt,
        lastCombatAt: entry.lastCombatAt,
        aiAlreadyPaidThisWar: entry.aiPaidForPeaceAt !== undefined && (entry.lastCombatAt === undefined || entry.lastCombatAt <= entry.aiPaidForPeaceAt)
      };
    },
    size: () => pairs.size
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
  return {
    attackerId,
    defenderId,
    attackerWon: event.attackerWon === true,
    tilesCaptured: (event.combatResult?.changes ?? []).filter((change) => change.ownerId === attackerId).length
  };
};
