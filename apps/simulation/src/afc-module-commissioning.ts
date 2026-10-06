/**
 * Module commissioning, first slice (docs/manifest-full-plan.md §3-4,
 * §10 step 4): when a player researches an AFC_MODULE-category Manifest,
 * install its single House-owned copy onto their home AFC. The copy can later
 * be redeployed. Research while owning no AFC retains the tech but has no
 * copy location until a player gains an AFC; backfillMissingHouseModules
 * installs those (and any copy lost when its AFC was captured) later.
 */
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

export type AfcModuleCommissioningContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
};

// The player's home AFC: their owned, settled AFC with the earliest
// activatedAt (tile key breaks ties, for determinism). Mirrors the
// "first/oldest anchor wins" convention used elsewhere in this codebase
// (e.g. firstThreeTownKeysForPlayer) rather than introducing a new rule.
const homeAfcTileKey = (ctx: AfcModuleCommissioningContext, playerId: string): string | undefined => {
  let best: { tileKey: string; activatedAt: number } | undefined;
  for (const tileKey of ctx.summaryForPlayer(playerId).ownedAfcTileKeys) {
    const tile = ctx.tiles.get(tileKey);
    if (!tile?.afc || tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    const activatedAt = tile.afc.activatedAt ?? 0;
    if (!best || activatedAt < best.activatedAt || (activatedAt === best.activatedAt && tileKey < best.tileKey)) {
      best = { tileKey, activatedAt };
    }
  }
  return best?.tileKey;
};

export const commissionModuleIfApplicable = (
  ctx: AfcModuleCommissioningContext,
  playerId: string,
  techId: string,
  commandId: string
): void => {
  if (techEntryById.get(techId)?.manifestCategory !== "AFC_MODULE") return;
  const tileKey = homeAfcTileKey(ctx, playerId);
  if (!tileKey) return;
  const tile = ctx.tiles.get(tileKey);
  if (!tile?.afc || tile.afc.houseModules?.includes(techId)) return;
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

/** Installs a House copy for every researched AFC_MODULE tech that no owned
 * AFC currently holds. Covers techs researched before the player had an AFC
 * (or before commissioning shipped) and House copies lost when the AFC
 * holding them was captured. Returns true when anything was installed. */
export const backfillMissingHouseModules = (
  ctx: AfcModuleCommissioningContext,
  playerId: string,
  techIds: Iterable<string>,
  commandId: string
): boolean => {
  const tileKey = homeAfcTileKey(ctx, playerId);
  if (!tileKey) return false;
  const held = new Set<string>();
  for (const ownedKey of ctx.summaryForPlayer(playerId).ownedAfcTileKeys) {
    const owned = ctx.tiles.get(ownedKey);
    if (owned?.afc && owned.ownerId === playerId) for (const techId of owned.afc.houseModules ?? []) held.add(techId);
  }
  const missing = [...techIds].filter((techId) => !held.has(techId) && techEntryById.get(techId)?.manifestCategory === "AFC_MODULE").sort();
  const tile = ctx.tiles.get(tileKey);
  if (missing.length === 0 || !tile?.afc) return false;
  const updatedTile: DomainTileState = {
    ...tile,
    afc: {
      ...tile.afc,
      modules: [...(tile.afc.modules ?? []), ...missing],
      houseModules: [...(tile.afc.houseModules ?? []), ...missing]
    }
  };
  ctx.replaceTileState(tileKey, updatedTile, commandId);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [ctx.tileDeltaFromState(updatedTile)] });
  return true;
};
