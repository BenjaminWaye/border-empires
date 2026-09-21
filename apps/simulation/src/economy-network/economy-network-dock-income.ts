import { DOCK_CONNECTION_BONUS_PER_LINK_DEFAULT, DOCK_INCOME_PER_MIN, HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { customsHouseTradeMultiplierForDock } from "./economy-network-town-trade.js";
import type { DockEconomyContext, EconomyPlayer } from "./economy-network.js";
import { wrapX, wrapY, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;
export const dockConnectionBonusPerLinkForPlayer = (player: Pick<DomainPlayer, "techIds" | "domainIds">): number => {
  const configured = additiveEffectForPlayer(player, "dockConnectionBonusPerLink");
  return configured > 0 ? configured : DOCK_CONNECTION_BONUS_PER_LINK_DEFAULT;
};
export const dockConnectedOwnedSettledCount = (dockTileKey: string, playerId: string, context: DockEconomyContext): number => {
  let connectedCount = 0;
  for (const linkedDockTileKey of context.dockLinksByDockTileKey.get(dockTileKey) ?? []) {
    const linked = context.tiles.get(linkedDockTileKey);
    if (linked?.ownerId === playerId && linked.ownershipState === "SETTLED") connectedCount += 1;
  }
  return connectedCount;
};
export const dockSupportedByCustomsHouse = (dockTileKey: string, playerId: string, tiles: ReadonlyMap<string, DomainTileState>, dormantEconomicStructureKeys: ReadonlySet<string> = new Set()): boolean => {
  const [rawX, rawY] = dockTileKey.split(",");
  const cx = Number(rawX);
  const cy = Number(rawY);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dy === 0) continue;
    const neighborKey = keyFor(cx + dx, cy + dy);
    const neighbor = tiles.get(neighborKey);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.economicStructure?.type === "CUSTOMS_HOUSE" && neighbor.economicStructure.status === "active" && !dormantEconomicStructureKeys.has(neighborKey)) return true;
  }
  return false;
};
export const dockBaseGoldPerMinuteForPlayer = (tile: DomainTileState, player: EconomyPlayer, context: DockEconomyContext | undefined): number => {
  if (!tile.dockId || tile.ownerId !== player.id || tile.ownershipState !== "SETTLED") return 0;
  const dockKey = keyFor(tile.x, tile.y);
  const connectedDockCount = context ? dockConnectedOwnedSettledCount(dockKey, player.id, context) : 0;
  const base = DOCK_INCOME_PER_MIN * multiplicativeEffectForPlayer(player, "dockGoldOutputMult") * (player.wonderDockGoldMultiplier ?? 1) * (1 + dockConnectionBonusPerLinkForPlayer(player) * connectedDockCount);
  const harborExchangeBonus = context && dockSupportedByCustomsHouse(dockKey, player.id, context.tiles, context.dormantEconomicStructureKeys)
    ? HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK * connectedDockCount * customsHouseTradeMultiplierForDock(dockKey, player.id, context.tiles, context.dormantEconomicStructureKeys)
    : 0;
  return base + harborExchangeBonus;
};
export { HARBOR_EXCHANGE_GOLD_PER_CONNECTED_DOCK };
