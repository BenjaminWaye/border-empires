import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { AFC_SPECIALIZATION_BALANCE, structureShowsOnTile, type EconomicStructureType, type SlotResource } from "@border-empires/shared";
import { hasRevealedResourceForPlayer } from "../tech-domain-bridge/tech-resource-reveal.js";
import { reconcileAfcCoreTowns } from "./afc-core-towns.js";

export interface ScarcityDelivery {
  resource: SlotResource | undefined;
  deposits: number;
  deliveries: Array<{ key: string; type: EconomicStructureType }>;
  fallback: boolean;
}
const resourceCategory = (resource: DomainTileState["resource"]): SlotResource | undefined =>
  resource === "FARM" || resource === "FISH" ? "FOOD" : resource === "GEMS" ? "CRYSTAL" :
    resource === "TITANIUM" || resource === "UMBRITE" ? resource : undefined;
const booster = (resource: DomainTileState["resource"]): EconomicStructureType | undefined =>
  resource === "FARM" ? "HYDROGARDEN" : resource === "TITANIUM" || resource === "GEMS" ? "MINE" : resource === "UMBRITE" ? "UMBRITE_RIG" : undefined;

/** Owned known deposits determine scarcity; spending slots cannot manipulate the choice. */
export function previewScarcityDelivery(player: Pick<DomainPlayer, "id" | "techIds" | "domainIds">, tiles: Iterable<DomainTileState>, isLocked: (key: string) => boolean = () => false): ScarcityDelivery {
  const counts: Record<SlotResource, number> = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const candidates: Record<SlotResource, ScarcityDelivery["deliveries"]> = { FOOD: [], TITANIUM: [], CRYSTAL: [], UMBRITE: [] };
  for (const tile of tiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || !tile.resource || !hasRevealedResourceForPlayer(player, tile.resource)) continue;
    const resource = resourceCategory(tile.resource);
    if (!resource) continue;
    counts[resource] += 1;
    const type = booster(tile.resource);
    const key = `${tile.x},${tile.y}`;
    if (!type || tile.terrain !== "LAND" || tile.economicStructure || tile.fort || tile.observatory || tile.siegeBattery || tile.afc || isLocked(key)) continue;
    if (!structureShowsOnTile(type, { ownershipState: tile.ownershipState, resource: tile.resource, dockId: tile.dockId, townPopulationTier: tile.town?.populationTier, supportedTownCount: 0, supportedDockCount: 0 })) continue;
    candidates[resource].push({ key, type });
  }
  const order = AFC_SPECIALIZATION_BALANCE.scarcityResourceOrder;
  const resource = [...order].filter(key => candidates[key].length > 0).sort((a, b) => counts[a] - counts[b] || order.indexOf(a) - order.indexOf(b))[0];
  return { resource, deposits: resource ? counts[resource] : 0, deliveries: resource ? candidates[resource] : [], fallback: !resource };
}

export interface AfcInstallationOutcome {
  upgradeId: string;
  resource?: SlotResource;
  deliveredBuildings?: number;
  deliveredPopulation?: number;
  fallbackFoodSlots?: number;
}
export interface AfcInstallationGrantContext {
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  replaceTileState: (key: string, tile: DomainTileState, commandId?: string) => void;
  isLocked?: (key: string) => boolean;
}

/** Called exactly once after a new choice is accepted, never during hydration or AFC capture. */
export function applyAfcInstallationGrant(context: AfcInstallationGrantContext, player: DomainPlayer, upgradeId: string, commandId: string): AfcInstallationOutcome | undefined {
  if (upgradeId === "afc-exchequer-2") {
    const preview = previewScarcityDelivery(player, context.tiles.values(), context.isLocked);
    for (const delivery of preview.deliveries) {
      const tile = context.tiles.get(delivery.key)!;
      context.replaceTileState(delivery.key, { ...tile, economicStructure: { type: delivery.type, ownerId: player.id, status: "active", activatedAt: context.now() } }, commandId);
    }
    if (preview.fallback) player.afcScarcityFoodSlots = 1;
    return { upgradeId, ...(preview.resource ? { resource: preview.resource } : {}), deliveredBuildings: preview.deliveries.length, ...(preview.fallback ? { fallbackFoodSlots: 1 } : {}) };
  }
  if (upgradeId !== "afc-exchequer-5") return undefined;
  const ownedTowns = [...context.tiles.entries()].filter(([, tile]) => tile.ownerId === player.id && tile.ownershipState === "SETTLED" && tile.town);
  const core = reconcileAfcCoreTowns(player, ownedTowns.map(([key, tile]) => [key, tile.town!.populationTier]));
  let deliveredPopulation = 0;
  for (const key of core) {
    const tile = context.tiles.get(key)!;
    const town = tile.town!;
    if (town.populationTier === "METROPOLIS" || typeof town.population !== "number" || typeof town.maxPopulation !== "number") continue;
    const population = Math.max(town.population, Math.min(town.maxPopulation, Math.floor(town.population * 1.5)));
    deliveredPopulation += population - town.population;
    context.replaceTileState(key, { ...tile, town: { ...town, population } }, commandId);
  }
  return { upgradeId, deliveredPopulation };
}
