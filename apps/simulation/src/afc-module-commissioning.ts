/**
 * Module commissioning, first slice (docs/manifest-full-plan.md §3-4,
 * §10 step 4): when a player researches an AFC_MODULE-category Manifest,
 * install its single House-owned copy onto their home AFC (or the next AFC
 * with a free bay; docs/manifest-afc-module-bays-plan.md). The copy can later
 * be redeployed. Research while owning no AFC retains the tech but has no
 * copy location until a player gains an AFC; backfillMissingHouseModules
 * calls those (and any copy lost when its AFC was captured) down later.
 */
import { AFC_MODULE_BAY_COUNT, afcModuleBaysFree, afcModuleBaysUsed } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import { callDownAfcModules, type AfcModuleDeliveryContext } from "./afc-module-delivery/afc-module-delivery.js";

export type AfcModuleCommissioningContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
};

// The player's owned, settled AFCs, home first: earliest activatedAt, tile
// key breaking ties (for determinism). Mirrors the "first/oldest anchor wins"
// convention used elsewhere in this codebase (e.g. firstThreeTownKeysForPlayer).
const ownedAfcTileKeysOldestFirst = (ctx: AfcModuleCommissioningContext, playerId: string): string[] =>
  [...ctx.summaryForPlayer(playerId).ownedAfcTileKeys]
    .flatMap((tileKey) => {
      const tile = ctx.tiles.get(tileKey);
      return tile?.afc && tile.ownerId === playerId && tile.ownershipState === "SETTLED" ? [{ tileKey, activatedAt: tile.afc.activatedAt ?? 0 }] : [];
    })
    .sort((a, b) => a.activatedAt - b.activatedAt || (a.tileKey < b.tileKey ? -1 : a.tileKey > b.tileKey ? 1 : 0))
    .map((entry) => entry.tileKey);

/** Docks a newly researched module on the home AFC, or the next-oldest owned
 * AFC with a free bay (AFC_MODULE_BAY_COUNT). With every bay full it stays
 * undocked until the player frees a bay or adds an AFC and calls it down. */
export const commissionModuleIfApplicable = (
  ctx: AfcModuleCommissioningContext,
  playerId: string,
  techId: string,
  commandId: string
): void => {
  if (techEntryById.get(techId)?.manifestCategory !== "AFC_MODULE") return;
  const tileKeys = ownedAfcTileKeysOldestFirst(ctx, playerId);
  if (tileKeys.some((key) => ctx.tiles.get(key)?.afc?.houseModules?.includes(techId))) return;
  const tileKey = tileKeys.find((key) => {
    const afc = ctx.tiles.get(key)?.afc;
    return afc && afcModuleBaysFree(afc) > 0;
  });
  const tile = tileKey ? ctx.tiles.get(tileKey) : undefined;
  if (!tileKey || !tile?.afc) return;
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

/** Saves from before the 8-bay cap can hold more: shed House copies (newest
 * first) off any over-full AFC so they can be redistributed. Captured copies
 * are never shed. Returns the shed tech ids. */
const shedHouseModulesOverCap = (ctx: AfcModuleCommissioningContext, playerId: string, tileKeys: readonly string[], commandId: string): string[] => {
  const shed: string[] = [];
  for (const tileKey of tileKeys) {
    const tile = ctx.tiles.get(tileKey);
    if (!tile?.afc) continue;
    let modules = [...(tile.afc.modules ?? [])];
    const houseModules = [...(tile.afc.houseModules ?? [])];
    while (afcModuleBaysUsed({ modules, incomingModules: tile.afc.incomingModules }) > AFC_MODULE_BAY_COUNT && houseModules.length > 0) {
      const techId = houseModules.pop()!;
      const index = modules.lastIndexOf(techId);
      if (index >= 0) modules = [...modules.slice(0, index), ...modules.slice(index + 1)];
      shed.push(techId);
    }
    if (houseModules.length === (tile.afc.houseModules?.length ?? 0)) continue;
    const next: DomainTileState = { ...tile, afc: { ...tile.afc, modules, houseModules } };
    ctx.replaceTileState(tileKey, next, commandId);
    ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [ctx.tileDeltaFromState(next)] });
  }
  return shed;
};

/** Calls down a House copy for every researched AFC_MODULE tech that no
 * owned AFC has docked (in any form) or is receiving, into free bays, oldest
 * AFC first. Covers techs researched before the player had an AFC (or before
 * commissioning shipped), House copies lost when the AFC holding them was
 * captured, and copies shed from AFCs over the 8-bay cap. The copies land
 * after the normal call-down delay; any that fit nowhere stay undocked.
 * Returns true when anything changed. */
export const backfillMissingHouseModules = (
  ctx: AfcModuleCommissioningContext,
  delivery: AfcModuleDeliveryContext,
  playerId: string,
  techIds: Iterable<string>,
  commandId: string
): boolean => {
  const tileKeys = ownedAfcTileKeysOldestFirst(ctx, playerId);
  if (tileKeys.length === 0) return false;
  const shed = shedHouseModulesOverCap(ctx, playerId, tileKeys, commandId);
  const held = new Set<string>();
  for (const ownedKey of ctx.summaryForPlayer(playerId).ownedAfcTileKeys) {
    const owned = ctx.tiles.get(ownedKey);
    if (!owned?.afc || owned.ownerId !== playerId) continue;
    // Any docked copy counts, including captured/legacy ones without
    // provenance: the module already works there, so sending another is a duplicate.
    for (const techId of owned.afc.modules ?? []) held.add(techId);
    for (const techId of owned.afc.houseModules ?? []) held.add(techId);
    for (const entry of owned.afc.incomingModules ?? []) held.add(entry.techId);
  }
  let missing = [...techIds].filter((techId) => !held.has(techId) && techEntryById.get(techId)?.manifestCategory === "AFC_MODULE").sort();
  let sent = false;
  for (const tileKey of tileKeys) {
    if (missing.length === 0) break;
    const sentHere = callDownAfcModules(delivery, playerId, tileKey, missing, commandId);
    if (sentHere.length > 0) sent = true;
    missing = missing.filter((techId) => !sentHere.includes(techId));
  }
  return sent || shed.length > 0;
};
