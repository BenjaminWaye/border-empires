import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { usesAfcSpecializations } from "@border-empires/shared";

type CoreTownPlayer = Pick<DomainPlayer, "afcUpgradeRuleset" | "domainIds" | "afcCoreTownKeys">;
/** At most three live town keys. Existing members keep their order across checkpoints. */
export function reconcileAfcCoreTowns(player: CoreTownPlayer, entries: Iterable<readonly [string, string | undefined]>): string[] {
  const eligible = new Set([...entries].filter(([, tier]) => tier !== "SETTLEMENT").map(([key]) => key));
  const result = (player.afcCoreTownKeys ?? []).filter(key => eligible.has(key)).slice(0, 3);
  for (const key of [...eligible].sort()) {
    if (result.length >= 3) break;
    if (!result.includes(key)) result.push(key);
  }
  player.afcCoreTownKeys = result;
  return result;
}

/** Called with each ownership/town transition, before any cached economics are rebuilt. */
export function maintainAfcCoreTownForTileChange(players: ReadonlyMap<string, DomainPlayer>, key: string, previous: DomainTileState | undefined, next: DomainTileState): void {
  for (const ownerId of new Set([previous?.ownerId, next.ownerId])) {
    const player = ownerId ? players.get(ownerId) : undefined;
    if (!player || !usesAfcSpecializations(player)) continue;
    const eligible = next.ownerId === ownerId && next.ownershipState === "SETTLED" && next.town && next.town.populationTier !== "SETTLEMENT";
    const keys = (player.afcCoreTownKeys ?? []).filter(candidate => candidate !== key || eligible).slice(0, 3);
    if (eligible && keys.length < 3 && !keys.includes(key)) keys.push(key);
    player.afcCoreTownKeys = keys;
  }
}
