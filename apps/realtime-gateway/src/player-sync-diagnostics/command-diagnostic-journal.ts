import type { GatewayDebugEvent } from "../http-routes/http-routes.js";

const MAX_COMMANDS = 200;
const MAX_EVENTS_PER_COMMAND = 24;
const RETENTION_MS = 30 * 60_000;
const EVENT_NAMES = new Set([
  "gateway_frontier_received", "gateway_frontier_stage", "gateway_simulation_event_received", "gateway_input_to_state_slow",
  "gateway_command_payload_sent", "gateway_command_payload_queued", "gateway_command_payload_skipped", "simulation_submit_rpc_slow", "simulation_submit_failed"
]);

type CommandDiagnosticEnvironment = {
  eventLoopMaxMs?: number | undefined;
  backlogPendingCount?: number | undefined;
  simulationConnected?: boolean | undefined;
};
export type CommandDiagnosticSnapshot = {
  events: GatewayDebugEvent[];
  retention: {
    commands: number; commandsEvicted: number; eventsEvicted: number;
    maxCommands: number; maxEventsPerCommand: number; retentionMs: number;
  };
};
export interface CommandDiagnosticJournal {
  record(entry: GatewayDebugEvent): void;
  snapshot(playerId: string): CommandDiagnosticSnapshot;
}

// Only explicitly observed client ATTACK/EXPAND commands enter this journal.
// AI and automation event volume cannot inherit this retention policy.
export const createCommandDiagnosticJournal = (sample: () => CommandDiagnosticEnvironment): CommandDiagnosticJournal => {
  const commands = new Map<string, { playerId: string; firstAt: number; events: GatewayDebugEvent[] }>();
  let commandsEvicted = 0;
  let eventsEvicted = 0;
  const prune = (now: number): void => {
    for (const [key, command] of commands) {
      if (now - command.firstAt > RETENTION_MS) { commands.delete(key); commandsEvicted += 1; }
    }
  };
  return {
    record(entry: GatewayDebugEvent): void {
      const { commandId, playerId, stage } = entry.payload;
      if (!EVENT_NAMES.has(entry.event) || typeof commandId !== "string" || typeof playerId !== "string") return;
      if (entry.event === "gateway_frontier_received" || (entry.event === "gateway_frontier_stage" && stage === "received")) {
        prune(entry.at);
        if (!commands.has(commandId)) {
          if (commands.size >= MAX_COMMANDS) {
            const oldest = commands.keys().next().value;
            if (oldest !== undefined) { commands.delete(oldest); commandsEvicted += 1; }
          }
          commands.set(commandId, { playerId, firstAt: entry.at, events: [] });
        }
      }
      const command = commands.get(commandId);
      if (!command || command.playerId !== playerId) return;
      const environment = (entry.event.startsWith("gateway_frontier_") || entry.event === "gateway_input_to_state_slow") ? sample() : {};
      command.events.push({ ...entry, payload: { ...entry.payload, ...environment } });
      if (command.events.length > MAX_EVENTS_PER_COMMAND) { command.events.splice(8, 1); eventsEvicted += 1; }
    },
    snapshot(playerId: string): CommandDiagnosticSnapshot {
      prune(Date.now());
      return {
        events: [...commands.values()].filter((command) => command.playerId === playerId).flatMap((command) => command.events),
        // Aggregate counters expose saturation without exposing other players' events.
        retention: { commands: commands.size, commandsEvicted, eventsEvicted, maxCommands: MAX_COMMANDS, maxEventsPerCommand: MAX_EVENTS_PER_COMMAND, retentionMs: RETENTION_MS }
      };
    }
  };
};
