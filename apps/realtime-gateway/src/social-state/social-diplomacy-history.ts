import type { PersonalActivityDiplomacyCard, PersonalActivityDiplomacyEvent } from "@border-empires/game-domain";

// Recent truce/alliance changes per player, merged into the personal activity
// timeline (Chronicle "Yours") by handle-activity-timeline-messages.ts so
// diplomacy news lands there instead of in an on-map popup. Diplomacy lives
// in the gateway, not the simulation, so the simulation's aggregator never
// sees these.
//
// In-memory only: a gateway restart forgets up to a day of rows. Bounded per
// player (count + the timeline's 24h window) and by the number of players,
// which the social state already bounds.
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

export type DiplomacyHistory = {
  /** Records one event for both sides; each side sees the other as its counterparty. */
  recordPair: (
    a: { id: string; name: string },
    b: { id: string; name: string },
    event: PersonalActivityDiplomacyEvent,
    occurredAt: number,
    extra?: Pick<DiplomacyHistoryEntry, "durationHours" | "byPlayerId" | "court">
  ) => void;
  cardsFor: (playerId: string, from: number, to: number) => PersonalActivityDiplomacyCard[];
};

export const createDiplomacyHistory = (now: () => number): DiplomacyHistory => {
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

  return {
    recordPair(a, b, event, occurredAt, extra = {}) {
      push(a.id, { event, occurredAt, counterpartyPlayerId: b.id, counterpartyName: b.name, ...extra });
      push(b.id, { event, occurredAt, counterpartyPlayerId: a.id, counterpartyName: a.name, ...extra });
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
