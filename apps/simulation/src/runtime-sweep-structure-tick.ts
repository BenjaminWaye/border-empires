import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  SWEEP_ATTACK_COST,
  SWEEP_BUDGET_CAP
} from "@border-empires/shared";
import type { PlayerCandidateIndex } from "./player-candidate-index.js";
import { simulationTileKey } from "./seed-state.js";
import {
  chooseSweepExpansionStep,
  sweepAttackCandidates
} from "./territory-automation.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";

export type SweepStructureRuntimeInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  playerCandidateIndex: PlayerCandidateIndex;
  playerManpowerRegenPerMinute: (player: RuntimePlayer) => number;
  adjacentTileStates: (x: number, y: number) => DomainTileState[];
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => boolean;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

export type SweepStructureInput = {
  tileKey: string;
  tile: DomainTileState;
  sweepBudget: number | undefined;
  sweepActive: boolean | undefined;
  sweepBudgetUpdatedAt: number | undefined;
  sweepRadius: number;
  commandIdPrefix: string;
  applyUpdate: (fields: { sweepBudget: number; sweepBudgetUpdatedAt: number; sweepActive?: boolean }) => DomainTileState;
};

export const tickSweepStructure = (
  runtime: SweepStructureRuntimeInput,
  structure: SweepStructureInput,
  playerId: string,
  actor: RuntimePlayer,
  nowMs: number
): void => {
  const { tileKey, tile, sweepRadius, commandIdPrefix, applyUpdate } = structure;

  const elapsedMins = (nowMs - (structure.sweepBudgetUpdatedAt ?? nowMs)) / 60_000;
  const regenPerMin = runtime.playerManpowerRegenPerMinute(actor);
  const rawBudget = (structure.sweepBudget ?? 0) + Math.max(0, elapsedMins * regenPerMin);
  const newBudget = Math.min(SWEEP_BUDGET_CAP, rawBudget);

  if (!structure.sweepActive) {
    if (Math.abs(newBudget - (structure.sweepBudget ?? 0)) > 0.001) {
      const regenedTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs });
      runtime.replaceTileState(tileKey, regenedTile);
      const regenCommandId = runtime.nextTerritoryAutomationCommandId(`${commandIdPrefix}-regen`, playerId, tileKey, nowMs);
      runtime.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: regenCommandId,
        playerId,
        tileDeltas: [runtime.tileDeltaFromState(regenedTile)]
      });
    }
    return;
  }

  const candidates = runtime.playerCandidateIndex.hasAnchor(tileKey)
    ? runtime.playerCandidateIndex.sortedAttackCandidates(tileKey, sweepRadius)
    : sweepAttackCandidates(tile, playerId, sweepRadius, (x, y) => runtime.tiles.get(simulationTileKey(x, y)));
  const noTargets = candidates.length === 0;
  const noBudget = newBudget < SWEEP_ATTACK_COST;

  if (noTargets) {
    const deactivatedTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs, sweepActive: false });
    runtime.replaceTileState(tileKey, deactivatedTile);
    const deactivateCommandId = runtime.nextTerritoryAutomationCommandId(`${commandIdPrefix}-deact`, playerId, tileKey, nowMs);
    runtime.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: deactivateCommandId,
      playerId,
      tileDeltas: [runtime.tileDeltaFromState(deactivatedTile)]
    });
    return;
  }

  if (noBudget) {
    if (Math.abs(newBudget - (structure.sweepBudget ?? 0)) > 0.001) {
      const pausedTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs });
      runtime.replaceTileState(tileKey, pausedTile);
      const pauseCommandId = runtime.nextTerritoryAutomationCommandId(`${commandIdPrefix}-pause`, playerId, tileKey, nowMs);
      runtime.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: pauseCommandId,
        playerId,
        tileDeltas: [runtime.tileDeltaFromState(pausedTile)]
      });
    }
    return;
  }

  const findBorderingOwned = (target: DomainTileState): DomainTileState | undefined =>
    runtime.adjacentTileStates(target.x, target.y).find(
      (candidate) =>
        candidate.ownerId === playerId &&
        candidate.terrain === "LAND" &&
        !(candidate.ownershipState === "FRONTIER" && candidate.frontierDecayKind === "ENCIRCLEMENT")
    );

  let attackTarget: DomainTileState | undefined;
  let attackOrigin: DomainTileState | undefined;
  for (const candidate of candidates) {
    const owned = findBorderingOwned(candidate);
    if (owned) {
      attackTarget = candidate;
      attackOrigin = owned;
      break;
    }
  }

  const attackPrefix = commandIdPrefix === "sweep" ? "sweep" : commandIdPrefix;
  let commandAccepted = false;

  if (attackTarget && attackOrigin) {
    const sweepCommandId = runtime.nextTerritoryAutomationCommandId(attackPrefix, playerId, simulationTileKey(attackTarget.x, attackTarget.y), nowMs);
    commandAccepted = runtime.handleFrontierCommand(
      {
        commandId: sweepCommandId,
        sessionId: `system-runtime:territory-automation:${playerId}`,
        playerId,
        clientSeq: 0,
        issuedAt: nowMs,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: attackOrigin.x, fromY: attackOrigin.y, toX: attackTarget.x, toY: attackTarget.y })
      },
      "ATTACK"
    );
  } else {
    const step = chooseSweepExpansionStep(
      tile,
      candidates[0]!,
      playerId,
      sweepRadius,
      (x, y) => runtime.tiles.get(simulationTileKey(x, y))
    );
    if (step) {
      const expandCommandId = runtime.nextTerritoryAutomationCommandId(`${commandIdPrefix}-expand`, playerId, simulationTileKey(step.to.x, step.to.y), nowMs);
      commandAccepted = runtime.handleFrontierCommand(
        {
          commandId: expandCommandId,
          sessionId: `system-runtime:territory-automation:${playerId}`,
          playerId,
          clientSeq: 0,
          issuedAt: nowMs,
          type: "EXPAND",
          payloadJson: JSON.stringify({ fromX: step.origin.x, fromY: step.origin.y, toX: step.to.x, toY: step.to.y })
        },
        "EXPAND"
      );
    }
  }

  if (commandAccepted) {
    const afterAttackBudget = newBudget - SWEEP_ATTACK_COST;
    const attackedTile = applyUpdate({ sweepBudget: afterAttackBudget, sweepBudgetUpdatedAt: nowMs });
    runtime.replaceTileState(tileKey, attackedTile);
    const budgetDeltaCommandId = runtime.nextTerritoryAutomationCommandId(`${commandIdPrefix}-budget`, playerId, tileKey, nowMs);
    runtime.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: budgetDeltaCommandId,
      playerId,
      tileDeltas: [runtime.tileDeltaFromState(attackedTile)]
    });
  } else if (Math.abs(newBudget - (structure.sweepBudget ?? 0)) > 0.001) {
    const regenOnlyTile = applyUpdate({ sweepBudget: newBudget, sweepBudgetUpdatedAt: nowMs });
    runtime.replaceTileState(tileKey, regenOnlyTile);
    const regenCommandId = runtime.nextTerritoryAutomationCommandId(`${commandIdPrefix}-regen`, playerId, tileKey, nowMs);
    runtime.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: regenCommandId,
      playerId,
      tileDeltas: [runtime.tileDeltaFromState(regenOnlyTile)]
    });
  }
};
