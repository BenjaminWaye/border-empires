// Pure per-player strategic-resource (TITANIUM/CRYSTAL/UMBRITE/...) ledger
// helpers, extracted out of runtime.ts (already well over the file-line
// gate's 500-line budget and may not grow -- see AGENTS.md's file-and-type-
// discipline rule) since these three touch nothing but the `player` object
// and the resource key passed in.
import type { DomainPlayer } from "@border-empires/game-domain";
import type { StrategicResourceKey } from "./runtime-types.js";

export const strategicResourceAmount = (player: DomainPlayer, resource: StrategicResourceKey): number =>
  player.strategicResources?.[resource] ?? 0;

export const spendStrategicResource = (player: DomainPlayer, resource: StrategicResourceKey, amount: number): boolean => {
  const current = strategicResourceAmount(player, resource);
  if (current + 1e-6 < amount) return false;
  player.strategicResources = {
    ...(player.strategicResources ?? {}),
    [resource]: Math.max(0, current - amount)
  };
  return true;
};

export const addStrategicResource = (player: DomainPlayer, resource: StrategicResourceKey, amount: number): void => {
  const current = strategicResourceAmount(player, resource);
  player.strategicResources = {
    ...(player.strategicResources ?? {}),
    [resource]: current + amount
  };
};
