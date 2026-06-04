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
