import type { TechInfo } from "./client-types.js";

const titleCaseFromId = (value: string): string =>
  value
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const sanitizeTechCatalogEntry = (value: unknown): TechInfo | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  const id = value.id.trim();
  const name = typeof value.name === "string" && value.name.trim().length > 0 ? value.name : titleCaseFromId(id);
  const description = typeof value.description === "string" && value.description.trim().length > 0 ? value.description : `Technology: ${name}`;
  const requirements: TechInfo["requirements"] = { gold: 0, resources: {} };
  if (isRecord(value.requirements)) {
    requirements.gold = typeof value.requirements.gold === "number" ? value.requirements.gold : 0;
    requirements.resources = isRecord(value.requirements.resources)
      ? (value.requirements.resources as TechInfo["requirements"]["resources"])
      : {};
    if (Array.isArray(value.requirements.checklist)) {
      requirements.checklist = value.requirements.checklist as TechInfo["requirements"]["checklist"];
    }
    if (typeof value.requirements.canResearch === "boolean") {
      requirements.canResearch = value.requirements.canResearch;
    }
  } else {
    requirements.checklist = [];
    requirements.canResearch = false;
  }
  return {
    id,
    tier: typeof value.tier === "number" && Number.isFinite(value.tier) ? value.tier : 1,
    name,
    description,
    mods: isRecord(value.mods) ? (value.mods as TechInfo["mods"]) : {},
    requirements,
    ...(typeof value.rootId === "string" && value.rootId.trim().length > 0 ? { rootId: value.rootId } : {}),
    ...(typeof value.requires === "string" && value.requires.trim().length > 0 ? { requires: value.requires } : {}),
    ...(Array.isArray(value.prereqIds) ? { prereqIds: value.prereqIds.filter((item): item is string => typeof item === "string" && item.length > 0) } : {}),
    ...(typeof value.researchTimeSeconds === "number" ? { researchTimeSeconds: value.researchTimeSeconds } : {}),
    ...(isRecord(value.effects) ? { effects: value.effects as TechInfo["effects"] } : {}),
    ...(isRecord(value.grantsPowerup) &&
    typeof value.grantsPowerup.id === "string" &&
    typeof value.grantsPowerup.charges === "number"
      ? { grantsPowerup: { id: value.grantsPowerup.id, charges: value.grantsPowerup.charges } }
      : {})
  };
};

const placeholderTechInfo = (id: string): TechInfo => ({
  id,
  tier: 1,
  name: titleCaseFromId(id),
  description: `Technology: ${titleCaseFromId(id)}`,
  mods: {},
  requirements: {
    gold: 0,
    resources: {},
    checklist: [],
    canResearch: false
  }
});

export const resolveTechCatalog = (args: {
  incoming: unknown;
  previous: TechInfo[];
  ownedIds?: string[];
  choiceIds?: string[];
}): TechInfo[] => {
  const previousById = new Map(args.previous.map((tech) => [tech.id, tech] as const));
  const incomingEntries = Array.isArray(args.incoming) ? args.incoming.map(sanitizeTechCatalogEntry).filter((tech): tech is TechInfo => tech !== null) : [];
  const catalogById = new Map<string, TechInfo>();

  for (const tech of incomingEntries.length > 0 ? incomingEntries : args.previous) {
    catalogById.set(tech.id, tech);
  }

  for (const id of [...(args.ownedIds ?? []), ...(args.choiceIds ?? [])]) {
    if (!id || catalogById.has(id)) continue;
    catalogById.set(id, previousById.get(id) ?? placeholderTechInfo(id));
  }

  return [...catalogById.values()];
};
