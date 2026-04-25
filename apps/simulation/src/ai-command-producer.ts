import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type AiCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "chooseNextAutomationCommand" | "queueDepths" | "onEvent">;
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
  setIntervalFn?: (task: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
};

const hasHumanInteractiveBacklog = (queueDepths: QueueDepths): boolean => queueDepths.human_interactive > 0;

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
  let tickInFlight = false;
  let nextPlayerIndex = 0;
  const shouldRun = options.shouldRun ?? (() => true);

  const stopListening = options.runtime.onEvent((event) => {
    const pendingCommand = pendingCommandByPlayer.get(event.playerId);
    if (!pendingCommand || pendingCommand.commandId !== event.commandId) return;
    if (
      event.eventType === "COMMAND_REJECTED" ||
      event.eventType === "COMBAT_RESOLVED" ||
      event.eventType === "TILE_DELTA_BATCH" ||
      event.eventType === "COLLECT_RESULT" ||
      event.eventType === "TECH_UPDATE" ||
      event.eventType === "DOMAIN_UPDATE"
    ) {
      pendingCommandByPlayer.delete(event.playerId);
    }
  });

  const clearExpiredPendingCommands = (): void => {
    const cutoff = now() - pendingCommandTimeoutMs;
    for (const [playerId, pendingCommand] of pendingCommandByPlayer.entries()) {
      if (pendingCommand.startedAt <= cutoff) {
        pendingCommandByPlayer.delete(playerId);
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
        const nextClientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const issuedAt = now();
        const plannerStartedAt = now();
        const command = options.runtime.chooseNextAutomationCommand(playerId, nextClientSeq, issuedAt, "ai-runtime");
        const plannerDurationMs = Math.max(0, now() - plannerStartedAt);
        const breached = plannerDurationMs > plannerBreachThresholdMs;
        options.onPlannerTick?.({ durationMs: plannerDurationMs, breached });
        if (!command) continue;
        pendingCommandByPlayer.set(playerId, { commandId: command.commandId, startedAt: issuedAt });
        nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
        nextPlayerIndex = (playerIndex + 1) % options.aiPlayerIds.length;
        try {
          await options.submitCommand(command);
        } catch {
          pendingCommandByPlayer.delete(playerId);
        }
        return;
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
      stopListening();
    }
  };
};
