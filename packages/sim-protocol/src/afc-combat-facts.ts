export interface AfcCombatFacts {
  targetFortWardReady?: boolean;
  /** The target is the summarised player's besieged town (shared town-siege.ts), from the sim's full tile map. */
  targetTownBesieged?: boolean;
  factoryEquivalents: { titanium: number; umbrite: number };
}
export function parseAfcCombatFacts(json: string | undefined): AfcCombatFacts | undefined {
  if (!json) return undefined;
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object" || !("factoryEquivalents" in value)) return undefined;
    const factories = value.factoryEquivalents;
    if (!factories || typeof factories !== "object" || !("titanium" in factories) || !("umbrite" in factories) || typeof factories.titanium !== "number" || typeof factories.umbrite !== "number") return undefined;
    return { ...("targetFortWardReady" in value && typeof value.targetFortWardReady === "boolean" ? { targetFortWardReady: value.targetFortWardReady } : {}), ...("targetTownBesieged" in value && typeof value.targetTownBesieged === "boolean" ? { targetTownBesieged: value.targetTownBesieged } : {}), factoryEquivalents: { titanium: factories.titanium, umbrite: factories.umbrite } };
  } catch { return undefined; }
}
