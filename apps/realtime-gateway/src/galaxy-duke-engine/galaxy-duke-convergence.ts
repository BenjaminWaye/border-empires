// Convergence v0 (design doc §27): when the Court falls, the Duke with the
// highest Domain Weight takes the throne, the era is written into the Hall of
// Fame and a new era begins. Pure: the service supplies the ranks and labels.
import { HALL_STANDINGS } from "./galaxy-duke-config.js";

export type EraState = {
  era: number;
  startedAt: number;
  // Sectors already captured when this era began. Court Strength counts only
  // captures since, so a new era starts with a full Court.
  baselineCaptured: number;
};

export type HallStanding = { authUid: string; label: string; weight: number };

export type HallEntry = {
  era: number;
  endedAt: number;
  emperorAuthUid: string;
  emperorLabel: string;
  domainWeight: number;
  standings: HallStanding[];
};

export const FIRST_ERA = (at: number): EraState => ({ era: 1, startedAt: at, baselineCaptured: 0 });

// Sectors the Court has lost in the current era.
export const courtCapturedThisEra = (era: EraState, capturedSectors: number): number => Math.max(0, capturedSectors - era.baselineCaptured);

// Builds the record for the era that just ended, or undefined when nobody
// holds a Planet (a Court cannot fall to no one).
export const buildHallEntry = (era: EraState, ranked: ReadonlyArray<HallStanding>, at: number): HallEntry | undefined => {
  const top = ranked[0];
  if (!top) return undefined;
  return {
    era: era.era,
    endedAt: at,
    emperorAuthUid: top.authUid,
    emperorLabel: top.label,
    domainWeight: top.weight,
    standings: ranked.slice(0, HALL_STANDINGS).map((s) => ({ ...s }))
  };
};

export const nextEra = (era: EraState, capturedSectors: number, at: number): EraState => ({ era: era.era + 1, startedAt: at, baselineCaptured: capturedSectors });
