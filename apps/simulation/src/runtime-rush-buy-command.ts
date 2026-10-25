import type { RelicMutationContext } from "./runtime-relics.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  EXPAND_MANPOWER_COST,
  rushBuyPriceGold,
  SETTLE_MANPOWER_COST,
  STRUCTURE_REGISTRY,
  structureBuildManpowerCost,
  type BuildableStructureType
} from "@border-empires/shared";
import { quoteRelicRushBuy } from "./runtime-relic-rush-buy.js";
import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { economicOrObservatoryCancelRefund, fortCancelRefund, siegeBatteryCancelRefund } from "./runtime-structure-lifecycle-command-handlers.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { frontierClaimDurationMsForCoords } from "./runtime-frontier-command.js";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PendingSettlementRecord } from "./player-runtime-summary.js";
import type { LockRecord, RuntimePlayer } from "./runtime-types.js";
import { CombatLockIndex } from "./combat-lock-index/combat-lock-index.js";

export type RuntimeRushBuyCommandContext = {
  relicContext: RelicMutationContext;
  players: Map<string, RuntimePlayer>;
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  locksByTile: CombatLockIndex;
  tiles: Map<string, DomainTileState>;
  wonderCacheByPlayer: Map<string, Set<string>>;
  now: () => number;
  rejectCommand: (command: CommandEnvelope, code: string, message: string) => void;
  resolvePendingSettlement: (input: { ownerId: string; tileKey: string; startedAt: number; resolvesAt: number; commandId: string }) => void;
  resolveLock: (lock: LockRecord) => void;
  completeStructureBuild: (targetKey: string, ownerId: string, structureType: string, commandId: string) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  emitEvent: (event: { eventType: "COMMAND_RESOLVED"; commandId: string; playerId: string }) => void;
  structureCommandContext: () => RuntimeStructureCommandContext;
};

// §6.3: which under_construction field (if any) owned by `playerId` sits on
// `target`, and what structureType/completesAt to price/complete it with.
// Checked in the same fort -> observatory -> siegeBattery -> economicStructure
// order cancelStructureActionTile (runtime-structure-lifecycle-command-handlers.ts)
// already uses, so the two "what's in progress on this tile" checks can't disagree.
const rushBuyableFieldForPlayer = (
  target: DomainTileState,
  playerId: string
): { tileField: "fort" | "observatory" | "siegeBattery" | "economicStructure"; structureType: string; completesAt: number } | undefined => {
  if (target.fort?.ownerId === playerId && target.fort.status === "under_construction" && typeof target.fort.completesAt === "number") {
    return { tileField: "fort", structureType: target.fort.variant ?? "FORT", completesAt: target.fort.completesAt };
  }
  if (target.observatory?.ownerId === playerId && target.observatory.status === "under_construction" && typeof target.observatory.completesAt === "number") {
    return { tileField: "observatory", structureType: "OBSERVATORY", completesAt: target.observatory.completesAt };
  }
  if (target.siegeBattery?.ownerId === playerId && target.siegeBattery.status === "under_construction" && typeof target.siegeBattery.completesAt === "number") {
    return { tileField: "siegeBattery", structureType: target.siegeBattery.variant ?? "SIEGE_BATTERY", completesAt: target.siegeBattery.completesAt };
  }
  if (
    target.economicStructure?.ownerId === playerId &&
    target.economicStructure.status === "under_construction" &&
    typeof target.economicStructure.completesAt === "number"
  ) {
    return { tileField: "economicStructure", structureType: target.economicStructure.type, completesAt: target.economicStructure.completesAt };
  }
  return undefined;
};

// §6.3 rush-buy: pay gold to instantly finish an in-progress SETTLE,
// EXPAND (frontier claim), or structure build. Price is time-proportional
// (rushBuyPriceGold, §6.3's anchor table extended per user direction to the
// in-progress case) — structure prices are anchored off the SAME manpower
// cost/refund figures cancel already uses (fortCancelRefund/
// siegeBatteryCancelRefund/economicOrObservatoryCancelRefund), so a rush can
// never price a tier differently than cancelling it would refund. Completion
// reuses resolvePendingSettlement/resolveLock/completeStructureBuild — the
// exact functions the original timer would have called — so there is no
// second copy of "what happens when this finishes" to keep in sync.
export const handleRushBuyCommandImpl = (context: RuntimeRushBuyCommandContext, command: CommandEnvelope): void => {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    context.rejectCommand(command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);

  const pendingSettlement = context.pendingSettlementsByTile.get(targetKey);
  if (pendingSettlement && pendingSettlement.ownerId === command.playerId) {
    const totalMs = Math.max(1, pendingSettlement.resolvesAt - pendingSettlement.startedAt);
    const remainingMs = pendingSettlement.resolvesAt - context.now();
    // §6.3's rush price is anchored on the action's *manpower* cost — SETTLE_COST
    // is settle's small nominal gold price (unrelated), SETTLE_MANPOWER_COST is
    // the real anchor (20 manpower -> 10 gold full rush per §6.3's table).
    const quote = quoteRelicRushBuy(context, actor, rushBuyPriceGold(remainingMs, totalMs, SETTLE_MANPOWER_COST), command.commandId);
    const price = quote.price;
    if (actor.points < price) {
      context.rejectCommand(command, "INSUFFICIENT_GOLD", `rush-buy needs ${price} coin`);
      return;
    }
    actor.points -= price; quote.commit();
    context.resolvePendingSettlement({
      ownerId: pendingSettlement.ownerId,
      tileKey: pendingSettlement.tileKey,
      startedAt: pendingSettlement.startedAt,
      resolvesAt: pendingSettlement.resolvesAt,
      commandId: pendingSettlement.commandId
    });
    context.emitPlayerStateUpdate(command);
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    return;
  }

  const expandLock = context.locksByTile.targetLockAt(targetKey);
  if (expandLock && expandLock.actionType === "EXPAND" && expandLock.playerId === command.playerId) {
    const totalMs = Math.max(1, frontierClaimDurationMsForCoords(expandLock.targetX, expandLock.targetY));
    const remainingMs = expandLock.resolvesAt - context.now();
    const quote = quoteRelicRushBuy(context, actor, rushBuyPriceGold(remainingMs, totalMs, EXPAND_MANPOWER_COST), command.commandId);
    const price = quote.price;
    if (actor.points < price) {
      context.rejectCommand(command, "INSUFFICIENT_GOLD", `rush-buy needs ${price} coin`);
      return;
    }
    actor.points -= price; quote.commit();
    context.resolveLock(expandLock);
    context.emitPlayerStateUpdate(command);
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    return;
  }

  const target = context.tiles.get(targetKey);
  const inProgress = target && rushBuyableFieldForPlayer(target, command.playerId);
  if (!target || !inProgress) {
    context.rejectCommand(command, "RUSH_BUY_INVALID", "nothing in progress to rush here");
    return;
  }
  const { tileField, structureType, completesAt } = inProgress;
  if (target[tileField]?.pausedAt !== undefined) {
    context.rejectCommand(command, "RUSH_BUY_INVALID", "construction is paused due to an ongoing attack");
    return;
  }
  const refund =
    tileField === "fort" ? fortCancelRefund(actor, target.fort?.variant) :
    tileField === "siegeBattery" ? siegeBatteryCancelRefund(target.siegeBattery?.variant) :
    economicOrObservatoryCancelRefund(context.structureCommandContext(), command.playerId, structureType as BuildableStructureType);
  const spec = STRUCTURE_REGISTRY[structureType];
  if (!spec) {
    context.rejectCommand(command, "RUSH_BUY_INVALID", "unknown structure");
    return;
  }
  const speedMultKey =
    tileField === "fort" ? "fortBuildSpeedMult" :
    tileField === "siegeBattery" && structureType !== "RELAY_BEACON" ? "outpostDeploymentSpeedMult" :
    spec.kind === "ECONOMIC" ? "economicStructureBuildSpeedMult" :
    undefined;
  // Price against the real build window the build handler stamped
  // (startedAt..completesAt, which already folds in tier, owned count and speed
  // effects). spec.buildMs is the pre-D9 flat constant -- 60s for a Relay Beacon
  // that actually takes an hour -- so measuring against it priced every rush as
  // "just started". It stays only as the fallback for records predating startedAt.
  const startedAt = target[tileField]?.startedAt;
  const totalMs = typeof startedAt === "number" && completesAt > startedAt
    ? completesAt - startedAt
    : speedMultKey
      ? Math.max(1, Math.round(spec.buildMs / multiplicativeEffectForPlayer(actor, speedMultKey)))
      : spec.buildMs;
  const remainingMs = completesAt - context.now();
  const quote = quoteRelicRushBuy(context, actor, rushBuyPriceGold(remainingMs, totalMs, refund.manpower || structureBuildManpowerCost(structureType as BuildableStructureType)), command.commandId);
  const price = quote.price;
  if (actor.points < price) {
    context.rejectCommand(command, "INSUFFICIENT_GOLD", `rush-buy needs ${price} coin`);
    return;
  }
  actor.points -= price; quote.commit();
  context.completeStructureBuild(targetKey, command.playerId, structureType, command.commandId);
  context.emitPlayerStateUpdate(command);
};
