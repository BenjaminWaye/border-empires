import { techBlockedReasonSummary } from "../client-tech-requirements/client-tech-requirements.js";
import type { TechInfo } from "../client-types.js";

// Status helpers shared by the compact Manifest list and the expanded tree cards.

export const techCardStatusLine = (
  tech: TechInfo,
  prereqText: string,
  formatTechCost: (tech: TechInfo) => string
): { text: string; tone: "cost" | "missing" | "blocked" } => {
  if (tech.requirements.canResearch) return { text: formatTechCost(tech), tone: "cost" };
  const blocked = techBlockedReasonSummary(tech, prereqText);
  return { text: blocked.label, tone: blocked.tone };
};

export const techCardIsAvailable = (tech: TechInfo, isChoice: boolean, isPending: boolean): boolean =>
  !isPending && (tech.requirements.canResearch || isChoice);

// Owned and pending-unlock Manifests never carry the Good pick band.
export const techCardShowsGoodPick = (
  tech: TechInfo,
  isOwned: boolean,
  isPending: boolean,
  isGoodPick: ((tech: TechInfo) => boolean) | undefined
): boolean => !isOwned && !isPending && Boolean(isGoodPick?.(tech));

// Per-render lookup for the expanded tree, whose layout pass and node render
// both need the answer: each Manifest's fit is computed once.
export const createGoodPickLookup = (
  ownedIds: ReadonlySet<string>,
  isPending: (techId: string) => boolean,
  isGoodPick: ((tech: TechInfo) => boolean) | undefined
): ((tech: TechInfo) => boolean) => {
  const shownById = new Map<string, boolean>();
  return (tech) => {
    const cached = shownById.get(tech.id);
    if (cached !== undefined) return cached;
    const shown = techCardShowsGoodPick(tech, ownedIds.has(tech.id), isPending(tech.id), isGoodPick);
    shownById.set(tech.id, shown);
    return shown;
  };
};
