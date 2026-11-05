import type { RelicResource } from "./relic-catalog.js";

const RESOURCES: readonly RelicResource[] = ["TITANIUM", "CRYSTAL", "UMBRITE"];
export type RelicResourceSupply = Readonly<Record<RelicResource, { supply: number; demand: number }>>;

/** Caller supplies a deterministic draw; discovery gating precedes scarcity weighting. */
export const selectRelicResource = (
  revealed: ReadonlySet<RelicResource>, totals: RelicResourceSupply, draw: number
): RelicResource | undefined => {
  const candidates = RESOURCES.filter((resource) => revealed.has(resource));
  if (candidates.length === 0) return undefined;
  const weights = candidates.map((resource) => {
    const { supply, demand } = totals[resource];
    // Normalize by demand rather than treating rare-resource counts like FOOD counts.
    return Math.max(0.05, Math.min(20, (Math.max(0, demand) + 1) / (Math.max(0, supply) + 1)));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = (Number.isFinite(draw) ? Math.max(0, Math.min(1 - Number.EPSILON, draw)) : 0) * total;
  for (let i = 0; i < candidates.length; i += 1) {
    cursor -= weights[i]!;
    if (cursor < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
};
