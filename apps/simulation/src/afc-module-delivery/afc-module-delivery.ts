/**
 * AFC module call-down: a House module copy redeployed to an AFC spends
 * AFC_MODULE_CALL_DOWN_MS in transit (afc.incomingModules) before it docks
 * into modules/houseModules. The copy leaves its previous AFC immediately, so
 * nothing it unlocks is usable while it is in the air.
 */
import { AFC_MODULE_CALL_DOWN_MS, AFC_MODULE_SLOTS } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";

export type AfcModuleDeliveryContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  ownedAfcTileKeys: (playerId: string) => Iterable<string>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  scheduleAfter: (delayMs: number, task: () => void) => void;
};

type AfcState = NonNullable<DomainTileState["afc"]>;

/** Slots an AFC has spoken for: docked modules plus copies still in transit to it. */
export const afcSlotsUsed = (afc: AfcState): number => (afc.modules?.length ?? 0) + (afc.incomingModules?.length ?? 0);
export const afcHasFreeSlot = (afc: AfcState): boolean => afcSlotsUsed(afc) < AFC_MODULE_SLOTS;

const removeOne = (modules: readonly string[], techId: string): string[] => {
  const index = modules.indexOf(techId);
  return index < 0 ? [...modules] : [...modules.slice(0, index), ...modules.slice(index + 1)];
};

const withIncoming = (afc: AfcState, incoming: AfcState["incomingModules"]): AfcState => {
  const { incomingModules: _previous, ...rest } = afc;
  return incoming && incoming.length > 0 ? { ...rest, incomingModules: incoming } : rest;
};

const isOwnedAfc = (tile: DomainTileState | undefined, playerId: string): tile is DomainTileState & { afc: AfcState } =>
  Boolean(tile?.afc && tile.ownerId === playerId && tile.afc.ownerId === playerId);

const emitChanged = (ctx: AfcModuleDeliveryContext, playerId: string, commandId: string, changed: DomainTileState[]): void => {
  if (changed.length === 0) return;
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: changed.map((tile) => ctx.tileDeltaFromState(tile)) });
  ctx.emitPlayerStateUpdate({ commandId, playerId });
};

/** Docks every incoming module on this AFC whose arrival time has passed. */
export const completeAfcModuleDeliveries = (ctx: AfcModuleDeliveryContext, tileKey: string, playerId: string, commandId: string): void => {
  const tile = ctx.tiles.get(tileKey);
  if (!isOwnedAfc(tile, playerId)) return; // captured or lost in transit: the delivery is gone
  const now = ctx.now();
  const incoming = tile.afc.incomingModules ?? [];
  if (!incoming.some((entry) => entry.arrivesAt <= now)) return;
  const dueIds = [...new Set(incoming.filter((entry) => entry.arrivesAt <= now).map((entry) => entry.techId))].filter(
    (techId) => !tile.afc.houseModules?.includes(techId)
  );
  const next: DomainTileState = {
    ...tile,
    afc: withIncoming(
      { ...tile.afc, modules: [...(tile.afc.modules ?? []), ...dueIds], houseModules: [...(tile.afc.houseModules ?? []), ...dueIds] },
      incoming.filter((entry) => entry.arrivesAt > now)
    )
  };
  ctx.replaceTileState(tileKey, next, commandId);
  emitChanged(ctx, playerId, commandId, [next]);
};

/** Arms (or re-arms after a restart) the docking timer for one arrival time. */
export const scheduleAfcModuleDelivery = (ctx: AfcModuleDeliveryContext, tileKey: string, playerId: string, arrivesAt: number, commandId: string): void => {
  ctx.scheduleAfter(Math.max(0, arrivesAt - ctx.now()), () => {
    if (ctx.now() < arrivesAt) scheduleAfcModuleDelivery(ctx, tileKey, playerId, arrivesAt, commandId);
    else completeAfcModuleDeliveries(ctx, tileKey, playerId, commandId);
  });
};

/**
 * Sends the House copies of techIds to the AFC at targetKey: each copy is
 * pulled off whichever other owned AFC holds it (docked or still incoming)
 * and arrives at the target after delayMs (AFC_MODULE_CALL_DOWN_MS by
 * default). Techs already docked or incoming at the target are skipped, and
 * nothing beyond the target's AFC_MODULE_SLOTS is sent. Returns the tech ids sent.
 */
export const callDownAfcModules = (
  ctx: AfcModuleDeliveryContext,
  playerId: string,
  targetKey: string,
  techIds: readonly string[],
  commandId: string,
  delayMs: number = AFC_MODULE_CALL_DOWN_MS
): string[] => {
  const target = ctx.tiles.get(targetKey);
  if (!isOwnedAfc(target, playerId)) return [];
  const alreadyAtTarget = new Set([...(target.afc.houseModules ?? []), ...(target.afc.incomingModules ?? []).map((entry) => entry.techId)]);
  const freeSlots = Math.max(0, AFC_MODULE_SLOTS - afcSlotsUsed(target.afc));
  const sending = [...new Set(techIds)].filter((techId) => !alreadyAtTarget.has(techId)).slice(0, freeSlots);
  if (sending.length === 0) return [];
  const changed: DomainTileState[] = [];
  for (const tileKey of ctx.ownedAfcTileKeys(playerId)) {
    const tile = ctx.tiles.get(tileKey);
    if (tileKey === targetKey || !isOwnedAfc(tile, playerId)) continue;
    const held = sending.filter((techId) => tile.afc.houseModules?.includes(techId) || tile.afc.incomingModules?.some((entry) => entry.techId === techId));
    if (held.length === 0) continue;
    let modules = tile.afc.modules ?? [];
    for (const techId of held) if (tile.afc.houseModules?.includes(techId)) modules = removeOne(modules, techId);
    const next: DomainTileState = {
      ...tile,
      afc: withIncoming(
        { ...tile.afc, modules, houseModules: (tile.afc.houseModules ?? []).filter((techId) => !held.includes(techId)) },
        (tile.afc.incomingModules ?? []).filter((entry) => !held.includes(entry.techId))
      )
    };
    ctx.replaceTileState(tileKey, next, commandId);
    changed.push(next);
  }
  const arrivesAt = ctx.now() + delayMs;
  const nextTarget: DomainTileState = {
    ...target,
    afc: withIncoming(target.afc, [...(target.afc.incomingModules ?? []), ...sending.map((techId) => ({ techId, arrivesAt }))])
  };
  ctx.replaceTileState(targetKey, nextTarget, commandId);
  changed.push(nextTarget);
  emitChanged(ctx, playerId, commandId, changed);
  scheduleAfcModuleDelivery(ctx, targetKey, playerId, arrivesAt, commandId);
  return sending;
};
