import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { SETTLE_COST } from "@border-empires/shared";
import type { PendingSettlementRecord } from "../player-runtime-summary.js";
import { applySettleCost, settlementBaseDurationMsForTile, settlementDurationMsForPlayer } from "../runtime-settlement-rules.js";
import type { SettlementResolutionInput } from "./runtime-settlement-resolution.js";

// Extracted from runtime.ts (500-line source budget, see AGENTS.md): starts a
// SETTLE (Garrison) timer. The matching completion is
// runtime-settlement-resolution.ts.
export type SettlementStartInput = {
  commandId: string;
  playerId: string;
  targetKey: string;
  target: DomainTileState;
  startedAt: number;
  emitStartedUpdate?: boolean;
};

export interface SettlementStartContext {
  players: ReadonlyMap<string, DomainPlayer>;
  addPendingSettlement(record: PendingSettlementRecord): void;
  scheduleAfter(delayMs: number, task: () => void): void;
  resolvePendingSettlement(input: SettlementResolutionInput): void;
  emitEvent(event: SimulationEvent): void;
  emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">): void;
}

export const startSettlementProcess = (context: SettlementStartContext, input: SettlementStartInput): void => {
  const actor = context.players.get(input.playerId);
  if (!actor) return;
  applySettleCost(actor);
  const settleDurationMs = settlementDurationMsForPlayer(actor, settlementBaseDurationMsForTile(input.target));
  const resolvesAt = input.startedAt + settleDurationMs;
  context.addPendingSettlement({
    ownerId: input.playerId,
    tileKey: input.targetKey,
    startedAt: input.startedAt,
    resolvesAt,
    goldCost: SETTLE_COST,
    commandId: input.commandId
  });
  // Armed before the emits below: if either throws (callers like the
  // territory-automation tick catch and log), the slot must still free.
  context.scheduleAfter(settleDurationMs, () =>
    context.resolvePendingSettlement({
      ownerId: input.playerId,
      tileKey: input.targetKey,
      startedAt: input.startedAt,
      resolvesAt,
      commandId: input.commandId
    })
  );
  context.emitEvent({
    eventType: "SETTLEMENT_STARTED",
    commandId: input.commandId,
    playerId: input.playerId,
    tileKey: input.targetKey,
    startedAt: input.startedAt,
    resolvesAt,
    goldCost: SETTLE_COST
  });
  if (input.emitStartedUpdate !== false) {
    context.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.playerId });
  }
};
