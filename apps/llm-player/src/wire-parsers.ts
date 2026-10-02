// Defensive readers for gateway wire payloads. INIT and PLAYER_UPDATE have no
// shared exported runtime schema (they're assembled ad hoc by apps/realtime-
// gateway), so each field is validated by hand instead of cast. Split out of
// game-socket.ts to keep that file under the repo's 500-line cap.
import type { SlotResource } from "@border-empires/shared";
import type { DomainOption, DomainState, EventLogEntry, ResourceSlots } from "./game-types.js";

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const tileKey = (x: number, y: number): string => `${x},${y}`;

// A fresh object per call so no caller can mutate a shared fallback.
const emptyResourceSlots = (): ResourceSlots => ({
  supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
});

export const asAutoSettlementQueue = (value: unknown): Array<{ x: number; y: number }> => {
  if (!Array.isArray(value)) return [];
  const entries: Array<{ x: number; y: number }> = [];
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.x === "number" && typeof entry.y === "number") entries.push({ x: entry.x, y: entry.y });
  }
  return entries;
};

export const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
export const asTechIds = asStringArray;

const asSlotRecord = (value: unknown): Record<SlotResource, number> => {
  if (!isRecord(value)) return { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const at = (key: SlotResource): number => (typeof value[key] === "number" ? (value[key] as number) : 0);
  return { FOOD: at("FOOD"), TITANIUM: at("TITANIUM"), CRYSTAL: at("CRYSTAL"), UMBRITE: at("UMBRITE") };
};

export const asResourceSlots = (value: unknown): ResourceSlots => {
  if (!isRecord(value)) return emptyResourceSlots();
  return { supply: asSlotRecord(value.supply), demand: asSlotRecord(value.demand) };
};

export const asEventLogEntry = (value: unknown): EventLogEntry | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.text !== "string" ||
    typeof value.occurredAt !== "number"
  ) {
    return undefined;
  }
  const x = typeof value.x === "number" ? value.x : undefined;
  const y = typeof value.y === "number" ? value.y : undefined;
  return {
    id: value.id,
    type: value.type,
    text: value.text,
    occurredAt: value.occurredAt,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {})
  };
};

const asNumberRecord = (value: unknown): Record<string, number> => {
  const result: Record<string, number> = {};
  if (!isRecord(value)) return result;
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) result[key] = amount;
  }
  return result;
};

const asDomainOption = (value: unknown): DomainOption | undefined => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.tier !== "number") return undefined;
  const requirements = isRecord(value.requirements) ? value.requirements : {};
  // Fail closed: a domain is a permanent pick, so an entry whose cost is
  // unreadable is dropped rather than treated as free.
  if (typeof requirements.gold !== "number") return undefined;
  const effects = isRecord(value.effects) ? value.effects : {};
  return {
    id: value.id,
    tier: value.tier,
    name: typeof value.name === "string" ? value.name : value.id,
    description: typeof value.description === "string" ? value.description : "",
    requiresTechId: typeof value.requiresTechId === "string" ? value.requiresTechId : "",
    goldCost: requirements.gold,
    resourceCost: asNumberRecord(requirements.resources),
    needsResourceChoice: typeof effects.chosenResourceSlotGrant === "number" && effects.chosenResourceSlotGrant > 0
  };
};

export const emptyDomainState = (): DomainState => ({ domainIds: [], openChoiceIds: [], catalog: [], strategicResources: {} });

// Merges whichever domain fields `source` carries onto `previous` -- INIT
// spreads them across the message and its player objects, and TECH_UPDATE/
// DOMAIN_UPDATE resend them together, so absent fields keep their last value.
export const mergeDomainState = (previous: DomainState, source: Record<string, unknown>): DomainState => {
  const parsedCatalog = Array.isArray(source.domainCatalog)
    ? source.domainCatalog.map(asDomainOption).filter((entry): entry is DomainOption => entry !== undefined)
    : [];
  return {
    domainIds: "domainIds" in source ? asStringArray(source.domainIds) : previous.domainIds,
    openChoiceIds: "domainChoices" in source ? asStringArray(source.domainChoices) : previous.openChoiceIds,
    // The catalog is static server data: a malformed or empty one must not
    // wipe a good one for the rest of the session.
    catalog: parsedCatalog.length > 0 ? parsedCatalog : previous.catalog,
    strategicResources: "strategicResources" in source ? asNumberRecord(source.strategicResources) : previous.strategicResources
  };
};
