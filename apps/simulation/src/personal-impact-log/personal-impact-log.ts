// Durable, bounded 24-hour source for the personal Activity dashboard's
// high-signal milestones. Unlike DomainPlayer.eventLog this is not snapshot
// state: it is a global rolling tail persisted alongside territory/combat
// activity logs. Producers opt in explicitly; do not route general
// SimulationEvent traffic through this log (state-and-persistence-discipline).
export const PERSONAL_IMPACT_WINDOW_MS = 24 * 60 * 60_000;
export const PERSONAL_IMPACT_LOG_MAX_ENTRIES = 5_000;

type PersonalImpactBase = {
  id: string;
  playerId: string;
  occurredAt: number;
  x: number;
  y: number;
};

export type PersonalImpactWaystationActivated = PersonalImpactBase & {
  kind: "WAYSTATION_ACTIVATED";
  grantedEffect: "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT";
  revealedAtX?: number;
  revealedAtY?: number;
  grantedTechId?: string;
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
  grantedTownName?: string;
  grantedTownX?: number;
  grantedTownY?: number;
  populationBurst?: number;
};

type PersonalImpactTownBase = PersonalImpactBase & {
  townName?: string;
  townTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  townSurvived: boolean;
  populationBefore: number;
  populationAfter: number;
  capturedStructureTypes: string[];
};

export type PersonalImpactTown = PersonalImpactTownBase & (
  | { kind: "TOWN_CAPTURED" }
  | { kind: "TOWN_LOST" }
);

export type PersonalImpactBuildingCompleted = PersonalImpactBase & {
  kind: "BUILDING_COMPLETED";
  structureType: string;
  instantGold?: number;
  populationBurst?: number;
};

export type PersonalImpactEvent =
  | PersonalImpactWaystationActivated
  | PersonalImpactTown
  | PersonalImpactBuildingCompleted;

export type PersonalImpactLogGauge = {
  entryCount: number;
  oldestAt: number | undefined;
  newestAt: number | undefined;
  capHits: number;
};

export type PersonalImpactLog = {
  record: (event: PersonalImpactEvent) => void;
  prune: (now: number) => void;
  entries: () => readonly PersonalImpactEvent[];
  gauge: () => PersonalImpactLogGauge;
  restore: (events: readonly PersonalImpactEvent[], now: number) => void;
};

export const createPersonalImpactLog = (options: { now?: () => number } = {}): PersonalImpactLog => {
  const now = options.now ?? (() => Date.now());
  let events: PersonalImpactEvent[] = [];
  let capHits = 0;

  const prune = (at: number): void => {
    const cutoff = at - PERSONAL_IMPACT_WINDOW_MS;
    if (events.length > 0 && events[0]!.occurredAt >= cutoff) return;
    events = events.filter((event) => event.occurredAt >= cutoff);
  };

  const record = (event: PersonalImpactEvent): void => {
    prune(now());
    events.push(event);
    if (events.length > PERSONAL_IMPACT_LOG_MAX_ENTRIES) {
      capHits += 1;
      events = events.slice(events.length - PERSONAL_IMPACT_LOG_MAX_ENTRIES);
    }
  };

  const restore = (restored: readonly PersonalImpactEvent[], at: number): void => {
    const cutoff = at - PERSONAL_IMPACT_WINDOW_MS;
    events = restored
      .filter((event) => event.occurredAt >= cutoff)
      .sort((left, right) => left.occurredAt - right.occurredAt)
      .slice(-PERSONAL_IMPACT_LOG_MAX_ENTRIES);
  };

  return {
    record,
    prune,
    restore,
    entries: () => events,
    gauge: () => ({
      entryCount: events.length,
      oldestAt: events[0]?.occurredAt,
      newestAt: events[events.length - 1]?.occurredAt,
      capHits
    })
  };
};
