import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type SystemCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "chooseNextOwnedFrontierCommand" | "queueDepths" | "onEvent">;
  systemPlayerIds: string[];
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  shouldRun?: () => boolean;
  startingClientSeqByPlayer?: Record<string, number>;
  now?: () => number;
  tickIntervalMs?: number;
  onTick?: (sample: { durationMs: number }) => void;
  setIntervalFn?: (task: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
};

const hasHumanOrSystemBacklog = (queueDepths: QueueDepths): boolean =>
  queueDepths.human_interactive > 0 || queueDepths.human_noninteractive > 0 || queueDepths.system > 0;

export const createSystemCommandProducer = (options: SystemCommandProducerOptions) => {
  const now = options.now ?? (() => Date.now());
  const tickIntervalMs = Math.max(25, options.tickIntervalMs ?? 500);
  const setIntervalFn = options.setIntervalFn ?? ((task, intervalMs) => setInterval(task, intervalMs));
  const clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle));
  const nextClientSeqByPlayer = new Map<string, number>(
    options.systemPlayerIds.map((playerId) => [playerId, options.startingClientSeqByPlayer?.[playerId] ?? 1] as const)
  );
  const pendingPlayers = new Set<string>();
  let tickInFlight = false;
  const shouldRun = options.shouldRun ?? (() => true);

  const stopListening = options.runtime.onEvent((event) => {
    if (!pendingPlayers.has(event.playerId)) return;
    if (event.eventType === "COMMAND_REJECTED" || event.eventType === "COMBAT_RESOLVED") {
      pendingPlayers.delete(event.playerId);
    }
  });

  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    if (!shouldRun()) return;
    if (hasHumanOrSystemBacklog(options.runtime.queueDepths())) return;
    tickInFlight = true;
    const tickStartedAt = now();
    try {
      for (const playerId of options.systemPlayerIds) {
        if (pendingPlayers.has(playerId)) continue;
        const nextClientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const command = options.runtime.chooseNextOwnedFrontierCommand(playerId, nextClientSeq, now(), "system-runtime");
        if (!command) continue;
        pendingPlayers.add(playerId);
        nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
        try {
          await options.submitCommand(command);
        } catch {
          pendingPlayers.delete(playerId);
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
