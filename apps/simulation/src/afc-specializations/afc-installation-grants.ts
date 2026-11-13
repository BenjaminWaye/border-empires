import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { AFC_SPECIALIZATION_BALANCE, landmarkConstructionBlocker, structureShowsOnTile, type EconomicStructureType, type LandmarkTile, type SlotResource } from "@border-empires/shared";
import { hasRevealedResourceForPlayer } from "../tech-domain-bridge/tech-resource-reveal.js";
import { reconcileAfcCoreTowns } from "./afc-core-towns.js";
import { refineryDeliveryCandidates } from "./afc-refinery-delivery.js";

export interface ScarcityDelivery {
  resource: SlotResource | undefined;
  deposits: number;
  /** FOOD: a Hydrogarden on the deposit. TITANIUM/CRYSTAL/UMBRITE: one refinery on a town's free, placeable support tile, already assigned to `field`. */
  deliveries: Array<{ key: string; type: EconomicStructureType; field?: { x: number; y: number } }>;
  fallback: boolean;
}
const resourceCategory = (resource: DomainTileState["resource"]): SlotResource | undefined =>
  resource === "FARM" || resource === "FISH" ? "FOOD" : resource === "GEMS" ? "CRYSTAL" :
    resource === "TITANIUM" || resource === "UMBRITE" ? resource : undefined;

/**
 * Owned known deposits determine scarcity; spending slots cannot manipulate
 * the choice. Strategic deposits take no on-tile building since Phase 2, so
 * their delivery is one town refinery for the best linked, unclaimed field
 * (afc-refinery-delivery.ts), and a resource with no such field has no candidate.
 * `tileMap` is the full tile map for the refinery link search; it defaults
 * to the tiles passed in.
 */
export function previewScarcityDelivery(
  player: Pick<DomainPlayer, "id" | "techIds" | "domainIds">,
  tiles: Iterable<DomainTileState>,
  landmarks: Pick<ReadonlyMap<string, LandmarkTile>, "get">,
  isLocked: (key: string) => boolean = () => false,
  tileMap?: ReadonlyMap<string, DomainTileState>
): ScarcityDelivery {
  const counts: Record<SlotResource, number> = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
  const candidates: Record<SlotResource, ScarcityDelivery["deliveries"]> = { FOOD: [], TITANIUM: [], CRYSTAL: [], UMBRITE: [] };
  const owned: DomainTileState[] = [];
  for (const tile of tiles) {
    if (tile.ownerId === player.id) owned.push(tile);
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || !tile.resource || !hasRevealedResourceForPlayer(player, tile.resource)) continue;
    const resource = resourceCategory(tile.resource);
    if (!resource) continue;
    counts[resource] += 1;
    const key = `${tile.x},${tile.y}`;
    if (tile.resource !== "FARM" || tile.terrain !== "LAND" || tile.economicStructure || tile.fort || tile.observatory || tile.siegeBattery || isLocked(key) || landmarkConstructionBlocker(landmarks, tile.x, tile.y)) continue;
    if (!structureShowsOnTile("HYDROGARDEN", { ownershipState: tile.ownershipState, resource: tile.resource, dockId: tile.dockId, townPopulationTier: tile.town?.populationTier, supportedTownCount: 0, supportedDockCount: 0 })) continue;
    candidates.FOOD.push({ key, type: "HYDROGARDEN" });
  }
  const map = tileMap ?? new Map(owned.map((tile) => [`${tile.x},${tile.y}`, tile] as const));
  for (const resource of ["TITANIUM", "CRYSTAL", "UMBRITE"] as const) {
    if (counts[resource] > 0) candidates[resource] = refineryDeliveryCandidates(map, player.id, owned, resource, isLocked);
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
    const preview = previewScarcityDelivery(player, context.tiles.values(), context.tiles, context.isLocked, context.tiles);
    for (const delivery of preview.deliveries) {
      const tile = context.tiles.get(delivery.key)!;
      const refineryField = delivery.field ? { refineryField: { ...delivery.field, assignedAt: context.now() } } : {};
      context.replaceTileState(delivery.key, { ...tile, economicStructure: { type: delivery.type, ownerId: player.id, status: "active", activatedAt: context.now(), ...refineryField } }, commandId);
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
