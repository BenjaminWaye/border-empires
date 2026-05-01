import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";

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
  onNoCommand?: (diagnostic: AutomationPlannerDiagnostic) => void;
  setIntervalFn?: (task: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
};

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean => queueDepths.human_interactive > 0;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
const isAutomationPreplanCommand = (type: CommandEnvelope["type"]): boolean =>
  type === "COLLECT_VISIBLE" || type === "CHOOSE_TECH" || type === "CHOOSE_DOMAIN";
const PREPLAN_OUTCOME_TIMEOUT_MS = 5_000;
type PreplanOutcome = "applied" | "cooldown_rejected" | "rejected" | "timed_out";
type TrackedPreplanCommand = { playerId: string; trackedAt: number };

export const createAiCommandProducer = (options: AiCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 250);
  const pendingCommandTimeoutMs = Math.max(1, options.pendingCommandTimeoutMs ?? Math.max(tickIntervalMs * 2, 90_000));
  const setIntervalFn = options.setIntervalFn ?? ((task, intervalMs) => setInterval(task, intervalMs));
  const clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle));
  const plannerBreachThresholdMs = Math.max(1, options.plannerBreachThresholdMs ?? 50);
  const nextClientSeqByPlayer = new Map<string, number>(
    options.aiPlayerIds.map((playerId) => [playerId, options.startingClientSeqByPlayer?.[playerId] ?? 1] as const)
  );
  const pendingCommandByPlayer = new Map<string, { commandId: string; startedAt: number }>();
  const pendingPreplanOutcomeByCommandId = new Map<string, { resolve: (outcome: PreplanOutcome) => void; timeoutHandle: ReturnType<typeof setTimeout> }>();
  const trackedPreplanByCommandId = new Map<string, TrackedPreplanCommand>();
  const collectVisibleCooldownUntilByPlayer = new Map<string, number>();
  let tickInFlight = false;
  let nextPlayerIndex = 0;
  const shouldRun = options.shouldRun ?? (() => true);

  const backOffCollectVisible = (playerId: string, eventAt: number): void => {
    collectVisibleCooldownUntilByPlayer.set(playerId, eventAt + COLLECT_VISIBLE_COOLDOWN_MS);
  };

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
    const pendingCommand = pendingCommandByPlayer.get(event.playerId);
    const pendingMatches = pendingCommand?.commandId === event.commandId;
    const trackedPreplan = trackedPreplanByCommandId.get(event.commandId);
    const trackedPreplanMatches = trackedPreplan?.playerId === event.playerId;
    if (!pendingMatches && !trackedPreplanMatches) return;
    if (event.eventType === "COMMAND_REJECTED" && event.code === "COLLECT_COOLDOWN") {
      backOffCollectVisible(event.playerId, now());
    }
    if (event.eventType === "COLLECT_RESULT") {
      backOffCollectVisible(event.playerId, now());
    }
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
      event.eventType === "COLLECT_RESULT" ||
      event.eventType === "TECH_UPDATE" ||
      event.eventType === "DOMAIN_UPDATE"
    ) {
      if (pendingMatches) pendingCommandByPlayer.delete(event.playerId);
      if (trackedPreplanMatches) trackedPreplanByCommandId.delete(event.commandId);
      resolvePendingPreplanOutcome(
        event.commandId,
        event.eventType === "COMMAND_REJECTED"
          ? (event.code === "COLLECT_COOLDOWN" ? "cooldown_rejected" : "rejected")
          : "applied"
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
      for (let offset = 0; offset < options.aiPlayerIds.length; offset += 1) {
        const playerIndex = (nextPlayerIndex + offset) % options.aiPlayerIds.length;
        const playerId = options.aiPlayerIds[playerIndex]!;
        if (pendingCommandByPlayer.has(playerId)) continue;
        let nextClientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        let skipPreplan = false;
        let advancedWithoutPending = false;
        for (let pass = 0; pass < 2; pass += 1) {
          const issuedAt = now();
          const plannerStartedAt = now();
          const plan = options.runtime.explainNextAutomationCommand
            ? options.runtime.explainNextAutomationCommand(playerId, nextClientSeq, issuedAt, "ai-runtime", { skipPreplan })
            : { command: options.runtime.chooseNextAutomationCommand(playerId, nextClientSeq, issuedAt, "ai-runtime") };
          const plannerDurationMs = Math.max(0, now() - plannerStartedAt);
          const breached = plannerDurationMs > plannerBreachThresholdMs;
          options.onPlannerTick?.({ durationMs: plannerDurationMs, breached });
          if (!plan.command && "diagnostic" in plan && plan.diagnostic) {
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
          if (plan.command.type === "COLLECT_VISIBLE") {
            const blockedUntil = collectVisibleCooldownUntilByPlayer.get(playerId) ?? 0;
            if (blockedUntil > issuedAt) {
              skipPreplan = true;
              continue;
            }
          }
          if (isAutomationPreplanCommand(plan.command.type)) {
            try {
              trackedPreplanByCommandId.set(plan.command.commandId, { playerId, trackedAt: issuedAt });
              pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, startedAt: issuedAt });
              await options.submitCommand(plan.command);
              nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
              options.onCommand?.({ playerId, commandType: plan.command.type });
              if (plan.command.type === "COLLECT_VISIBLE") {
                backOffCollectVisible(playerId, issuedAt);
              }
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
          pendingCommandByPlayer.set(playerId, { commandId: plan.command.commandId, startedAt: issuedAt });
          nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
          try {
            await options.submitCommand(plan.command);
            options.onCommand?.({ playerId, commandType: plan.command.type });
          } catch {
            pendingCommandByPlayer.delete(playerId);
          }
          return;
        }
        if (advancedWithoutPending) {
          nextClientSeqByPlayer.set(playerId, nextClientSeq);
          nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
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
