import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "../runtime/runtime.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import {
  createAiIntentLatchState,
  latchAiIntent,
  probeAiLatchedIntent,
  releaseAiLatchedIntent,
  reservationHeldByOtherAi,
  reserveAiTarget
} from "./ai-intent-latch.js";
import {
  extractOriginTileKey,
  extractTargetTileKey,
  intentKindForCommand,
  wakeWindowMsForCommand
} from "./ai-intent-latch-helpers.js";
import {
  clearDevelopmentReservation,
  reserveDevelopmentSlot,
  reservedDevelopmentSlotCount,
  type DevelopmentSlotReservation
} from "./ai-development-slot-reservations.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type AiCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "chooseNextAutomationCommand" | "queueDepths" | "onEvent"> & {
    explainNextAutomationCommand?: (
      playerId: string,
      clientSeq: number,
      issuedAt: number,
      sessionPrefix: "ai-runtime" | "system-runtime",
      options?: {
        skipPreplan?: boolean;
        reservedDevelopmentSlots?: number;
      }
    ) => { command?: CommandEnvelope; diagnostic: AutomationPlannerDiagnostic };
  };
  aiPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  pendingCommandTimeoutMs?: number;
  plannerBreachThresholdMs?: number;
  onPlannerTick?: (sample: { durationMs: number; breached: boolean }) => void;
  onTick?: (sample: { durationMs: number }) => void;
  onCommand?: (sample: { playerId: string; commandType: CommandEnvelope["type"] }) => void;
  onRejectedCommand?: (sample: { playerId: string; commandType: CommandEnvelope["type"] }) => void;
  onDecision?: (diagnostic: AutomationPlannerDiagnostic) => void;
  onNoCommand?: (diagnostic: AutomationPlannerDiagnostic) => void;
  setIntervalFn?: (task: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  territoryVersionForPlayer?: (playerId: string) => number;
};

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean => queueDepths.human_interactive > 0;
const isAutomationPreplanCommand = (type: CommandEnvelope["type"]): boolean =>
  type === "CHOOSE_TECH" || type === "CHOOSE_DOMAIN";
const PREPLAN_OUTCOME_TIMEOUT_MS = 5_000;
type PreplanOutcome = "applied" | "rejected" | "timed_out";
type TrackedPreplanCommand = { playerId: string; trackedAt: number };

export const createAiCommandProducer = (options: AiCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 250);
  const pendingCommandTimeoutMs = Math.max(1, options.pendingCommandTimeoutMs ?? Math.max(tickIntervalMs * 2, 90_000));
  const setIntervalFn = options.setIntervalFn ?? ((task, intervalMs) => setInterval(task, intervalMs));
  const clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle));
  const plannerBreachThresholdMs = Math.max(1, options.plannerBreachThresholdMs ?? 50);
  const aiPlayerIdSet = new Set(options.aiPlayerIds);
  const intentLatchState = createAiIntentLatchState();
  const latchingEnabled = typeof options.territoryVersionForPlayer === "function";
  const territoryVersionForPlayer = options.territoryVersionForPlayer ?? (() => 0);
  const nextClientSeqByPlayer = new Map<string, number>(
    options.aiPlayerIds.map((playerId) => [playerId, options.startingClientSeqByPlayer?.[playerId] ?? 1] as const)
  );
  const pendingCommandByPlayer = new Map<string, { commandId: string; commandType: CommandEnvelope["type"]; startedAt: number }>();
  const pendingPreplanOutcomeByCommandId = new Map<string, { resolve: (outcome: PreplanOutcome) => void; timeoutHandle: ReturnType<typeof setTimeout> }>();
  const trackedPreplanByCommandId = new Map<string, TrackedPreplanCommand>();
  const developmentReservationsByPlayer = new Map<string, DevelopmentSlotReservation[]>();
  const urgentByPlayerId = new Set<string>();
  let tickInFlight = false;
  let nextPlayerIndex = 0;
  const shouldRun = options.shouldRun ?? (() => true);


  const resolvePendingPreplanOutcome = (commandId: string, outcome: PreplanOutcome): void => {
    const pending = pendingPreplanOutcomeByCommandId.get(commandId);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    pendingPreplanOutcomeByCommandId.delete(commandId);
    pending.resolve(outcome);
  };

  const waitForPreplanOutcome = (playerId: string, commandId: string): Promise<PreplanOutcome> =>
    new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        pendingPreplanOutcomeByCommandId.delete(commandId);
        const pendingCommand = pendingCommandByPlayer.get(playerId);
        if (pendingCommand?.commandId === commandId) pendingCommandByPlayer.delete(playerId);
        resolve("timed_out");
      }, PREPLAN_OUTCOME_TIMEOUT_MS);
      pendingPreplanOutcomeByCommandId.set(commandId, { resolve, timeoutHandle });
    });

  const stopListening = options.runtime.onEvent((event) => {
    if (event.eventType === "COMMAND_REJECTED") {
      clearDevelopmentReservation(developmentReservationsByPlayer, event.playerId, event.commandId);
    }
    if (
      event.eventType === "COMBAT_RESOLVED" &&
      event.attackerWon &&
      event.actionType === "ATTACK" &&
      event.combatResult?.defenderOwnerId &&
      aiPlayerIdSet.has(event.combatResult.defenderOwnerId) &&
      !aiPlayerIdSet.has(event.playerId)
    ) {
      urgentByPlayerId.add(event.combatResult.defenderOwnerId);
    }
    const pendingCommand = pendingCommandByPlayer.get(event.playerId);
    const pendingMatches = pendingCommand?.commandId === event.commandId;
    const trackedPreplan = trackedPreplanByCommandId.get(event.commandId);
    const trackedPreplanMatches = trackedPreplan?.playerId === event.playerId;
    if (!pendingMatches && !trackedPreplanMatches) return;
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
      event.eventType === "TECH_UPDATE" ||
      event.eventType === "DOMAIN_UPDATE"
    ) {
      if (pendingMatches) pendingCommandByPlayer.delete(event.playerId);
      if (trackedPreplanMatches) trackedPreplanByCommandId.delete(event.commandId);
      if (
        latchingEnabled &&
        pendingMatches &&
        (
          event.eventType === "COMMAND_REJECTED" ||
          event.eventType === "COMBAT_RESOLVED" ||
          event.eventType === "TILE_DELTA_BATCH"
        )
      ) {
        // Release on any terminal pending event:
        //  - COMBAT_RESOLVED for ATTACK/EXPAND
        //  - TILE_DELTA_BATCH for SETTLE/BUILD_*
        //  - COMMAND_REJECTED for any failure
        releaseAiLatchedIntent(intentLatchState, event.playerId);
      }
      if (pendingMatches && event.eventType === "COMMAND_REJECTED" && pendingCommand) {
        options.onRejectedCommand?.({ playerId: event.playerId, commandType: pendingCommand.commandType });
      }
      resolvePendingPreplanOutcome(
        event.commandId,
        event.eventType === "COMMAND_REJECTED" ? "rejected" : "applied"
      );
    }
  });

  const clearExpiredPendingCommands = (): void => {
    const cutoff = now() - pendingCommandTimeoutMs;
    for (const [playerId, pendingCommand] of pendingCommandByPlayer.entries()) {
      if (pendingCommand.startedAt <= cutoff) {
        pendingCommandByPlayer.delete(playerId);
      }
    }
    for (const [commandId, trackedPreplan] of trackedPreplanByCommandId.entries()) {
      if (trackedPreplan.trackedAt <= cutoff) {
        trackedPreplanByCommandId.delete(commandId);
      }
    }
  };

  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    if (!shouldRun()) return;
    if (hasHumanInteractiveBacklog(options.runtime.queueDepths())) return;
    tickInFlight = true;
    const tickStartedAt = now();
    try {
      if (options.aiPlayerIds.length === 0) return;
      clearExpiredPendingCommands();
      const iterationOrder: number[] = [];
      const seenIndices = new Set<number>();
      const urgentSnapshot = [...urgentByPlayerId];
      for (const urgentPlayerId of urgentSnapshot) {
        if (!aiPlayerIdSet.has(urgentPlayerId)) {
          urgentByPlayerId.delete(urgentPlayerId);
          continue;
        }
        const idx = options.aiPlayerIds.indexOf(urgentPlayerId);
        if (idx >= 0 && !seenIndices.has(idx)) {
          iterationOrder.push(idx);
          seenIndices.add(idx);
        }
      }
      for (let offset = 0; offset < options.aiPlayerIds.length; offset += 1) {
        const playerIndex = (nextPlayerIndex + offset) % options.aiPlayerIds.length;
        if (!seenIndices.has(playerIndex)) {
          iterationOrder.push(playerIndex);
          seenIndices.add(playerIndex);
        }
      }
      for (const playerIndex of iterationOrder) {
        const playerId = options.aiPlayerIds[playerIndex]!;
        if (pendingCommandByPlayer.has(playerId)) continue;
        const playerTerritoryVersion = territoryVersionForPlayer(playerId);
        if (latchingEnabled) {
          const probe = probeAiLatchedIntent(intentLatchState, {
            playerId,
            nowMs: now(),
            territoryVersion: playerTerritoryVersion
          });
          if (probe.status === "waiting") continue;
        }
        let nextClientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        let skipPreplan = false;
        let advancedWithoutPending = false;
        for (let pass = 0; pass < 2; pass += 1) {
          const issuedAt = now();
          const plannerStartedAt = now();
          const reservedDevelopmentSlots = reservedDevelopmentSlotCount(developmentReservationsByPlayer, playerId, issuedAt);
          const plan = options.runtime.explainNextAutomationCommand
            ? options.runtime.explainNextAutomationCommand(
                playerId,
                nextClientSeq,
                issuedAt,
                "ai-runtime",
                {
                  skipPreplan,
                  ...(reservedDevelopmentSlots > 0 ? { reservedDevelopmentSlots } : {})
                }
              )
            : { command: options.runtime.chooseNextAutomationCommand(playerId, nextClientSeq, issuedAt, "ai-runtime") };
          const plannerDurationMs = Math.max(0, now() - plannerStartedAt);
          const breached = plannerDurationMs > plannerBreachThresholdMs;
          options.onPlannerTick?.({ durationMs: plannerDurationMs, breached });
          if (!plan.command && "diagnostic" in plan && plan.diagnostic) {
            options.onDecision?.(plan.diagnostic);
            options.onNoCommand?.(plan.diagnostic);
          }
          if (!plan.command) {
            if (advancedWithoutPending) {
              nextClientSeqByPlayer.set(playerId, nextClientSeq);
              nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
              return;
            }
            break;
          }
          if ("diagnostic" in plan && plan.diagnostic) {
            options.onDecision?.(plan.diagnostic);
          }
          if (isAutomationPreplanCommand(plan.command.type)) {
            try {
              trackedPreplanByCommandId.set(plan.command.commandId, { playerId, trackedAt: issuedAt });
              pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, commandType: plan.command.type, startedAt: issuedAt });
              await options.submitCommand(plan.command);
              nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
              options.onCommand?.({ playerId, commandType: plan.command.type });
              const preplanOutcome = await waitForPreplanOutcome(playerId, plan.command.commandId);
              if (preplanOutcome === "timed_out" || preplanOutcome === "rejected") {
                break;
              }
              nextClientSeq += 1;
              skipPreplan = true;
              advancedWithoutPending = true;
              continue;
            } catch {
              pendingCommandByPlayer.delete(playerId);
              trackedPreplanByCommandId.delete(plan.command.commandId);
              resolvePendingPreplanOutcome(plan.command.commandId, "rejected");
              break;
            }
          }
          const targetTileKey = latchingEnabled ? extractTargetTileKey(plan.command) : undefined;
          const intentKind = latchingEnabled ? intentKindForCommand(plan.command.type) : undefined;
          if (
            latchingEnabled &&
            intentKind &&
            targetTileKey &&
            reservationHeldByOtherAi(intentLatchState, playerId, targetTileKey, issuedAt)
          ) {
            // Another AI has committed to this tile; defer planning and let the
            // round-robin pick a different target next pass.
            break;
          }
          pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, commandType: plan.command.type, startedAt: issuedAt });
          nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
          const wasUrgent = urgentByPlayerId.delete(playerId);
          if (latchingEnabled && intentKind) {
            const wakeWindowMs = wakeWindowMsForCommand(plan.command.type);
            if (wakeWindowMs > 0) {
              const wakeAt = issuedAt + wakeWindowMs;
              const originTileKey = extractOriginTileKey(plan.command);
              const actionKey = `${plan.command.type}:${targetTileKey ?? originTileKey ?? plan.command.commandId}`;
              latchAiIntent(intentLatchState, {
                playerId,
                actionKey,
                kind: intentKind,
                startedAt: issuedAt,
                wakeAt,
                territoryVersion: playerTerritoryVersion,
                ...(targetTileKey ? { targetTileKey } : {}),
                ...(originTileKey ? { originTileKey } : {})
              });
              if (targetTileKey) {
                reserveAiTarget(
                  intentLatchState,
                  { playerId, actionKey, tileKey: targetTileKey, createdAt: issuedAt, wakeAt },
                  issuedAt
                );
              }
            }
          }
          try {
            await options.submitCommand(plan.command);
            reserveDevelopmentSlot(developmentReservationsByPlayer, plan.command, issuedAt);
            options.onCommand?.({ playerId, commandType: plan.command.type });
          } catch {
            pendingCommandByPlayer.delete(playerId);
            if (latchingEnabled) releaseAiLatchedIntent(intentLatchState, playerId);
            // Restore urgency on failed submit so the defender doesn't lose
            // its priority slot to a transient command-store error.
            if (wasUrgent) urgentByPlayerId.add(playerId);
          }
          return;
        }
        if (advancedWithoutPending) {
          nextClientSeqByPlayer.set(playerId, nextClientSeq);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
          urgentByPlayerId.delete(playerId);
          return;
        }
      }
    } finally {
      options.onTick?.({ durationMs: Math.max(0, now() - tickStartedAt) });
      tickInFlight = false;
    }
  };

  const intervalHandle = setIntervalFn(() => {
    void tick();
  }, tickIntervalMs);

  return {
    tick,
    close(): void {
      clearIntervalFn(intervalHandle);
      for (const pending of pendingPreplanOutcomeByCommandId.values()) clearTimeout(pending.timeoutHandle);
      pendingPreplanOutcomeByCommandId.clear();
      trackedPreplanByCommandId.clear();
      stopListening();
    }
  };
};
