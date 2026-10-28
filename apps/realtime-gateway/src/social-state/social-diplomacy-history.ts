import type { PersonalActivityDiplomacyCard, PersonalActivityDiplomacyEvent } from "@border-empires/game-domain";

// Recent truce/alliance changes per player, merged into the personal activity
// timeline (Chronicle "Yours") by handle-activity-timeline-messages.ts so
// diplomacy news lands there instead of in an on-map popup. Diplomacy lives
// in the gateway, not the simulation, so the simulation's aggregator never
// sees these.
//
// Persisted through the social store (social_diplomacy_history), so a
// gateway restart keeps the last day's rows. Bounded per player (count + the
// timeline's 24h window), in memory and in the store alike, and by the number
// of players, which the social state already bounds.
export const DIPLOMACY_HISTORY_PER_PLAYER_CAP = 20;
export const DIPLOMACY_HISTORY_TTL_MS = 24 * 60 * 60_000;

export const diplomacyHistoryDiagnostics = { entries: 0, evictions: 0 };

export type DiplomacyHistoryEntry = {
  event: PersonalActivityDiplomacyEvent;
  occurredAt: number;
  counterpartyPlayerId: string;
  counterpartyName: string;
  durationHours?: number;
  byPlayerId?: string;
  court?: boolean;
};

/** A row as saved in the social store. */
export type StoredDiplomacyHistoryEntry = { playerId: string } & DiplomacyHistoryEntry;

export type DiplomacyHistory = {
  /** Records one event for both sides; each side sees the other as its counterparty. */
  /** Names are looked up when recorded, so a row keeps the name the player had at the time. */
  recordPair: (
    aId: string,
    bId: string,
    event: PersonalActivityDiplomacyEvent,
    occurredAt: number,
    extra?: Pick<DiplomacyHistoryEntry, "durationHours" | "byPlayerId" | "court">
  ) => void;
  cardsFor: (playerId: string, from: number, to: number) => PersonalActivityDiplomacyCard[];
};

export const createDiplomacyHistory = (
  now: () => number,
  options: {
    initial?: readonly StoredDiplomacyHistoryEntry[] | undefined;
    save?: ((playerId: string, entry: DiplomacyHistoryEntry) => void) | undefined;
    /** Read-only name lookup; an unknown player keeps their id as the name rather than gaining a record. */
    nameOf?: ((playerId: string) => string | undefined) | undefined;
  } = {}
): DiplomacyHistory => {
  const byPlayerId = new Map<string, DiplomacyHistoryEntry[]>();
  let entryCount = 0;

  const prune = (playerId: string, entries: DiplomacyHistoryEntry[]): DiplomacyHistoryEntry[] => {
    const cutoff = now() - DIPLOMACY_HISTORY_TTL_MS;
    const kept = entries.filter((entry) => entry.occurredAt >= cutoff).slice(-DIPLOMACY_HISTORY_PER_PLAYER_CAP);
    diplomacyHistoryDiagnostics.evictions += entries.length - kept.length;
    entryCount += kept.length - entries.length;
    if (kept.length === 0) byPlayerId.delete(playerId);
    else byPlayerId.set(playerId, kept);
    diplomacyHistoryDiagnostics.entries = entryCount;
    return kept;
  };

  const push = (playerId: string, entry: DiplomacyHistoryEntry): void => {
    const entries = byPlayerId.get(playerId) ?? [];
    entries.push(entry);
    entryCount += 1;
    // Kept in occurredAt order; an expiry is recorded at the truce's own end time, which can be earlier than a newer row.
    entries.sort((left, right) => left.occurredAt - right.occurredAt);
    prune(playerId, entries);
  };

  for (const { playerId, ...entry } of options.initial ?? []) push(playerId, entry);

  const record = (playerId: string, entry: DiplomacyHistoryEntry): void => {
    push(playerId, entry);
    options.save?.(playerId, entry);
  };

  return {
    recordPair(aId, bId, event, occurredAt, extra = {}) {
      const nameOf = (playerId: string): string => options.nameOf?.(playerId) ?? playerId;
      record(aId, { event, occurredAt, counterpartyPlayerId: bId, counterpartyName: nameOf(bId), ...extra });
      record(bId, { event, occurredAt, counterpartyPlayerId: aId, counterpartyName: nameOf(aId), ...extra });
    },
    cardsFor(playerId, from, to) {
      const entries = byPlayerId.get(playerId);
      if (!entries) return [];
      return prune(playerId, entries)
        .filter((entry) => entry.occurredAt >= from && entry.occurredAt <= to)
        .map((entry) => ({
          kind: "DIPLOMACY" as const,
          id: `diplomacy:${entry.event}:${entry.counterpartyPlayerId}:${entry.occurredAt}`,
          ...entry
        }));
    }
  };
};

/**
 * The history's rows plus finished alliance breaks, newest first. Breaks come
 * from completedAllianceBreaks (persisted, so they survive a restart) rather
 * than the in-memory history.
 */
export const diplomacyActivityCards = (
  historyCards: PersonalActivityDiplomacyCard[],
  completedAllianceBreaks: Iterable<{ playerAId: string; playerBId: string; finalizedAt: number }>,
  playerId: string,
  playersById: ReadonlyMap<string, { name: string }>,
  from: number,
  to: number
): PersonalActivityDiplomacyCard[] => {
  const cards = [...historyCards];
  for (const notice of completedAllianceBreaks) {
    if (notice.finalizedAt < from || notice.finalizedAt > to) continue;
    const otherId = notice.playerAId === playerId ? notice.playerBId : notice.playerBId === playerId ? notice.playerAId : undefined;
    if (!otherId) continue;
    cards.push({
      kind: "DIPLOMACY",
      id: `diplomacy:ALLIANCE_BROKEN:${otherId}:${notice.finalizedAt}`,
      occurredAt: notice.finalizedAt,
      event: "ALLIANCE_BROKEN",
      counterpartyPlayerId: otherId,
      counterpartyName: playersById.get(otherId)?.name ?? otherId
    });
  }
  return cards.sort((left, right) => right.occurredAt - left.occurredAt);
};
