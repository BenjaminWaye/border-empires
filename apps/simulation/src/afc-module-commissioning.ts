/**
 * Module commissioning, first slice (docs/manifest-full-plan.md §3-4,
 * §10 step 4): when a player researches an AFC_MODULE-category Manifest,
 * install its single House-owned copy onto their oldest AFC with a free slot
 * (AFC_MODULE_SLOTS per AFC). The copy can later be redeployed. Research while
 * every AFC is full -- or while owning no AFC -- retains the tech but leaves
 * the copy waiting; backfillMissingHouseModules calls those (and any copy lost
 * when its AFC was captured) down once a slot exists, e.g. after building
 * another AFC.
 */
import type { DomainTileState } from "@border-empires/game-domain";
import { AFC_MODULE_CALL_DOWN_MS, AFC_MODULE_SLOTS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import { afcHasFreeSlot, afcSlotsUsed, callDownAfcModules, type AfcModuleDeliveryContext } from "./afc-module-delivery/afc-module-delivery.js";

export type AfcModuleCommissioningContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
};

// The player's owned, settled AFCs, oldest first (earliest activatedAt, tile
// key breaking ties). The first is the "home" AFC -- the same "first/oldest
// anchor wins" convention used elsewhere (e.g. firstThreeTownKeysForPlayer).
const ownedAfcKeysOldestFirst = (tiles: ReadonlyMap<string, DomainTileState>, tileKeys: Iterable<string>, playerId: string): string[] =>
  [...tileKeys]
    .filter((tileKey) => {
      const tile = tiles.get(tileKey);
      return Boolean(tile?.afc && tile.ownerId === playerId && tile.ownershipState === "SETTLED");
    })
    .sort((left, right) => {
      const ageDelta = (tiles.get(left)?.afc?.activatedAt ?? 0) - (tiles.get(right)?.afc?.activatedAt ?? 0);
      return ageDelta || (left < right ? -1 : left > right ? 1 : 0);
    });

// Re-delivery order after a loss: Economy modules first (docs/manifest-full-plan.md
// §4), then the remaining branches in the plan's order; tech id breaks ties.
const BRANCH_DELIVERY_RANK: Readonly<Record<string, number>> = { economy: 0, manpower: 1, war: 2, aether: 3 };
const deliveryRank = (techId: string): number => BRANCH_DELIVERY_RANK[techEntryById.get(techId)?.branch ?? ""] ?? 4;
export const sortModulesForDelivery = (techIds: readonly string[]): string[] =>
  [...techIds].sort((left, right) => deliveryRank(left) - deliveryRank(right) || (left < right ? -1 : left > right ? 1 : 0));

export const commissionModuleIfApplicable = (
  ctx: AfcModuleCommissioningContext,
  playerId: string,
  techId: string,
  commandId: string
): void => {
  if (techEntryById.get(techId)?.manifestCategory !== "AFC_MODULE") return;
  const ownedKeys = ownedAfcKeysOldestFirst(ctx.tiles, ctx.summaryForPlayer(playerId).ownedAfcTileKeys, playerId);
  if (ownedKeys.some((tileKey) => ctx.tiles.get(tileKey)?.afc?.houseModules?.includes(techId))) return;
  const tileKey = ownedKeys.find((key) => {
    const afc = ctx.tiles.get(key)?.afc;
    return afc ? afcHasFreeSlot(afc) : false;
  });
  if (!tileKey) return; // every AFC is full (or none owned): the copy waits for a free slot
  const tile = ctx.tiles.get(tileKey);
  if (!tile?.afc) return;
  const updatedTile: DomainTileState = {
    ...tile,
    afc: {
      ...tile.afc,
      // Keep a separate array entry even when this AFC already holds a
      // captured copy: the House copy is independently movable.
      modules: [...(tile.afc.modules ?? []), techId],
      houseModules: [...(tile.afc.houseModules ?? []), techId]
    }
  };
  ctx.replaceTileState(tileKey, updatedTile, commandId);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [ctx.tileDeltaFromState(updatedTile)] });
};

/** Calls down a House copy for every researched AFC_MODULE tech that no
 * owned AFC has docked (in any form) or is receiving: techs researched before
 * the player had an AFC (or a free slot) and House copies lost when the AFC
 * holding them was captured. Copies fill free slots on the player's AFCs,
 * oldest first, Economy first, landing one per AFC_MODULE_CALL_DOWN_MS (the
 * first after one interval). Anything without a free slot keeps waiting.
 * Returns true when anything was sent. */
export const backfillMissingHouseModules = (
  ctx: Pick<AfcModuleCommissioningContext, "tiles">,
  delivery: AfcModuleDeliveryContext,
  playerId: string,
  techIds: Iterable<string>,
  commandId: string
): boolean => {
  const ownedKeys = ownedAfcKeysOldestFirst(ctx.tiles, delivery.ownedAfcTileKeys(playerId), playerId);
  if (ownedKeys.length === 0) return false;
  const held = new Set<string>();
  for (const ownedKey of ownedKeys) {
    const owned = ctx.tiles.get(ownedKey)?.afc;
    if (!owned) continue;
    // Any docked copy counts, including captured/legacy ones without
    // provenance: the module already works there, so sending another is a duplicate.
    for (const techId of owned.modules ?? []) held.add(techId);
    for (const techId of owned.houseModules ?? []) held.add(techId);
    for (const entry of owned.incomingModules ?? []) held.add(entry.techId);
  }
  const queue = sortModulesForDelivery([...techIds].filter((techId) => !held.has(techId) && techEntryById.get(techId)?.manifestCategory === "AFC_MODULE"));
  let sent = 0;
  for (const tileKey of ownedKeys) {
    const afc = ctx.tiles.get(tileKey)?.afc;
    if (!afc) continue;
    for (const techId of queue.splice(0, Math.max(0, AFC_MODULE_SLOTS - afcSlotsUsed(afc)))) {
      sent += callDownAfcModules(delivery, playerId, tileKey, [techId], commandId, AFC_MODULE_CALL_DOWN_MS * (sent + 1)).length;
    }
  }
  return sent > 0;
};

/** Moves House copies off any AFC holding more than AFC_MODULE_SLOTS (docked
 * before the cap existed) onto the player's other AFCs with free slots. What
 * fits nowhere stays where it is. Returns true when anything moved. */
export const rebalanceOverfullAfcs = (
  ctx: Pick<AfcModuleCommissioningContext, "tiles">,
  delivery: AfcModuleDeliveryContext,
  playerId: string,
  commandId: string
): boolean => {
  const ownedKeys = ownedAfcKeysOldestFirst(ctx.tiles, delivery.ownedAfcTileKeys(playerId), playerId);
  if (ownedKeys.length < 2) return false;
  let moved = false;
  for (const sourceKey of ownedKeys) {
    const source = ctx.tiles.get(sourceKey)?.afc;
    if (!source) continue;
    const excess = afcSlotsUsed(source) - AFC_MODULE_SLOTS;
    if (excess <= 0) continue;
    // Only House copies can move; the most recently docked go first.
    for (const techId of (source.houseModules ?? []).slice(-excess).reverse()) {
      const targetKey = ownedKeys.find((key) => {
        const afc = ctx.tiles.get(key)?.afc;
        return key !== sourceKey && afc ? afcHasFreeSlot(afc) : false;
      });
      if (!targetKey) return moved;
      moved = callDownAfcModules(delivery, playerId, targetKey, [techId], commandId).length > 0 || moved;
    }
  }
  return moved;
};
