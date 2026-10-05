import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";

/**
 * A tile that is the target of an unresolved ATTACK is frozen for development.
 * Otherwise a SETTLE or a build could finish while the fight is in flight, and
 * the defender would face a settled/fortified tile it never had when the
 * attack was launched (or the attacker would hit a frontier tile that
 * "became" settled mid-fight).
 *
 *  - A pending SETTLE on the tile is cancelled (gold refunded, slot freed).
 *  - An under_construction structure is paused: `pausedAt` is stamped and its
 *    completion timer becomes a no-op. When the fight no longer targets the
 *    tile (the defender held, the attack was cancelled, ...) the deadline
 *    slides forward by the time spent paused and a fresh timer is armed.
 *    If the attacker captures the tile the paused build is dropped by the
 *    normal capture path, same as any unfinished build.
 */

export type DevelopmentStructureField = "fort" | "observatory" | "siegeOutpost" | "economicStructure";
const STRUCTURE_FIELDS: readonly DevelopmentStructureField[] = ["fort", "observatory", "siegeOutpost", "economicStructure"];

export const structureTypeForField = (tile: DomainTileState, field: DevelopmentStructureField): string => {
  if (field === "fort") return tile.fort?.variant ?? "FORT";
  if (field === "siegeOutpost") return tile.siegeOutpost?.variant ?? "SIEGE_OUTPOST";
  if (field === "observatory") return "OBSERVATORY";
  return tile.economicStructure?.type ?? "";
};

/** True while any under_construction structure on the tile is paused by an attack. */
export const tileHasPausedConstruction = (tile: DomainTileState | undefined): boolean =>
  Boolean(tile) && STRUCTURE_FIELDS.some((field) => {
    const structure = tile?.[field];
    return structure?.status === "under_construction" && structure.pausedAt !== undefined;
  });

export type StructureCompletionTimerContext = {
  now: () => number;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  tiles: Map<string, DomainTileState>;
  completeStructureBuild: (targetKey: string, ownerId: string, structureType: string, commandId: string) => void;
};

/**
 * Arms the one-shot completion timer for an under_construction structure.
 * The timer only completes the build if the structure still carries the exact
 * deadline it was armed for and is not paused: a pause/resume cycle moves the
 * deadline (and arms its own timer), so the earlier timer must not complete
 * the build early.
 */
export const scheduleStructureCompletion = (
  ctx: StructureCompletionTimerContext,
  input: { tileKey: string; ownerId: string; field: DevelopmentStructureField; structureType: string; commandId: string; completesAt: number }
): void => {
  ctx.scheduleAfter(Math.max(0, input.completesAt - ctx.now()), () => {
    const live = ctx.tiles.get(input.tileKey)?.[input.field];
    if (!live || live.completesAt !== input.completesAt || live.pausedAt !== undefined) return;
    ctx.completeStructureBuild(input.tileKey, input.ownerId, input.structureType, input.commandId);
  });
};

export type AttackDevelopmentHoldContext = StructureCompletionTimerContext & {
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  /** Cancels (and refunds) a pending SETTLE on the tile that `attackerId` does not own. Returns true if one was cancelled. */
  cancelPendingSettlementForAttack: (tileKey: string, attackerId: string, commandId: string) => boolean;
};

const emitTileUpdate = (ctx: AttackDevelopmentHoldContext, tileKey: string, tile: DomainTileState, ownerId: string, commandId: string): void => {
  ctx.replaceTileState(tileKey, tile, commandId);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas: [ctx.tileDeltaFromState(tile)] });
  ctx.emitPlayerStateUpdate({ commandId, playerId: ownerId });
};

/** Called when an ATTACK lock is accepted against `targetKey`. */
export const holdDevelopmentForAttack = (
  ctx: AttackDevelopmentHoldContext,
  input: { targetKey: string; attackerId: string; commandId: string }
): void => {
  const tile = ctx.tiles.get(input.targetKey);
  if (!tile?.ownerId || tile.ownerId === input.attackerId) return;
  ctx.cancelPendingSettlementForAttack(input.targetKey, input.attackerId, input.commandId);
  const latest = ctx.tiles.get(input.targetKey) ?? tile;
  const now = ctx.now();
  let paused: DomainTileState = latest;
  for (const field of STRUCTURE_FIELDS) {
    const structure = latest[field];
    if (structure?.status !== "under_construction" || structure.pausedAt !== undefined || typeof structure.completesAt !== "number") continue;
    paused = { ...paused, [field]: { ...structure, pausedAt: now } } as DomainTileState;
  }
  if (paused !== latest) emitTileUpdate(ctx, input.targetKey, paused, tile.ownerId, `attack-hold:${input.commandId}`);
};

/**
 * Called once no fight targets `tileKey` any more. Resumes every paused
 * structure with its remaining time intact. No-op for tiles with nothing paused
 * (including tiles the attacker just captured: the capture path already
 * dropped the unfinished build).
 */
export const releaseDevelopmentHold = (ctx: AttackDevelopmentHoldContext, tileKey: string, commandId: string): void => {
  const tile = ctx.tiles.get(tileKey);
  if (!tile?.ownerId || !tileHasPausedConstruction(tile)) return;
  const now = ctx.now();
  let resumed: DomainTileState = tile;
  const timers: Array<{ field: DevelopmentStructureField; completesAt: number }> = [];
  for (const field of STRUCTURE_FIELDS) {
    const structure = tile[field];
    if (structure?.status !== "under_construction" || structure.pausedAt === undefined) continue;
    const { pausedAt, ...rest } = structure;
    const completesAt = (structure.completesAt ?? now) + Math.max(0, now - pausedAt);
    resumed = { ...resumed, [field]: { ...rest, completesAt } } as DomainTileState;
    timers.push({ field, completesAt });
  }
  emitTileUpdate(ctx, tileKey, resumed, tile.ownerId, `attack-resume:${commandId}`);
  for (const { field, completesAt } of timers) {
    scheduleStructureCompletion(ctx, {
      tileKey,
      ownerId: tile.ownerId,
      field,
      structureType: structureTypeForField(resumed, field),
      commandId: `attack-resume:${commandId}`,
      completesAt
    });
  }
};
