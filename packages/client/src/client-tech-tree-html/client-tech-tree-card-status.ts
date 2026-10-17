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
