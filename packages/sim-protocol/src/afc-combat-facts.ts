export interface AfcCombatFacts {
  targetFortWardReady?: boolean;
  factoryEquivalents: { titanium: number; umbrite: number };
  coalitionTargetIds: string[];
}
export function parseAfcCombatFacts(json: string | undefined): AfcCombatFacts | undefined {
  if (!json) return undefined;
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object" || !("factoryEquivalents" in value) || !("coalitionTargetIds" in value)) return undefined;
    const factories = value.factoryEquivalents;
    if (!factories || typeof factories !== "object" || !("titanium" in factories) || !("umbrite" in factories) || typeof factories.titanium !== "number" || typeof factories.umbrite !== "number") return undefined;
    if (!Array.isArray(value.coalitionTargetIds) || value.coalitionTargetIds.length > 4096 || !value.coalitionTargetIds.every((id): id is string => typeof id === "string")) return undefined;
    return { ...("targetFortWardReady" in value && typeof value.targetFortWardReady === "boolean" ? { targetFortWardReady: value.targetFortWardReady } : {}), factoryEquivalents: { titanium: factories.titanium, umbrite: factories.umbrite }, coalitionTargetIds: [...value.coalitionTargetIds] };
  } catch { return undefined; }
}
