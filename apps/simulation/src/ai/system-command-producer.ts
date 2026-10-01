import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "../runtime/runtime.js";
import { BARBARIAN_PLAYER_ID } from "./system-job-barbarian-planner.js";
import { createBarbSettleRelay } from "./barbarian-settle-relay.js";

type QueueDepths = ReturnType<SimulationRuntime["queueDepths"]>;

type SystemCommandProducerOptions = {
  runtime: Pick<SimulationRuntime, "chooseNextOwnedFrontierCommand" | "barbarianBridge" | "queueDepths" | "onEvent">;
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
  // Barbarians are gated per tile inside the shared barbarian planner (in-flight
  // + rest + attack budget), not by the one-command-per-player gate below.
  const barbSettleRelay = createBarbSettleRelay({
    barbPlayerId: BARBARIAN_PLAYER_ID,
    postToWorker: (msg) => options.runtime.barbarianBridge().settle(msg.commandId, msg.settledAt),
    now
  });
  let tickInFlight = false;
  const shouldRun = options.shouldRun ?? (() => true);

  const stopListening = options.runtime.onEvent((event) => {
    barbSettleRelay.onEvent(event);
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
        const isBarb = playerId === BARBARIAN_PLAYER_ID;
        if (!isBarb && pendingPlayers.has(playerId)) continue;
        const nextClientSeq = nextClientSeqByPlayer.get(playerId) ?? 1;
        const command = isBarb
          ? options.runtime.barbarianBridge().choose(nextClientSeq, now())
          : options.runtime.chooseNextOwnedFrontierCommand(playerId, nextClientSeq, now(), "system-runtime");
        if (!command) continue;
        if (isBarb) barbSettleRelay.onSubmitted(command.commandId);
        else pendingPlayers.add(playerId);
        nextClientSeqByPlayer.set(playerId, nextClientSeq + 1);
        try {
          await options.submitCommand(command);
        } catch {
          pendingPlayers.delete(playerId);
          // A barbarian command that never reached the runtime must not hold its tile in flight.
          if (isBarb) barbSettleRelay.onEvent({ eventType: "COMMAND_REJECTED", playerId, commandId: command.commandId });
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
