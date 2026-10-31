/** Target-aware facts supplied by the authoritative simulation, including for offline owners. */
export interface RelicCombatFacts {
  attackMultiplier: number;
  defenseMultiplier: number;
  dockAttackMultiplier: number;
}
export function parseRelicCombatFacts(json: string | undefined): RelicCombatFacts | undefined {
  if (!json) return undefined;
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object" || !("attackMultiplier" in value) || !("defenseMultiplier" in value) || !("dockAttackMultiplier" in value)) return undefined;
    const { attackMultiplier, defenseMultiplier, dockAttackMultiplier } = value;
    if (typeof attackMultiplier !== "number" || typeof defenseMultiplier !== "number" || typeof dockAttackMultiplier !== "number") return undefined;
    if (![attackMultiplier, defenseMultiplier, dockAttackMultiplier].every(n => Number.isFinite(n) && n >= 1 && n <= 2)) return undefined;
    return { attackMultiplier, defenseMultiplier, dockAttackMultiplier };
  } catch { return undefined; }
}
