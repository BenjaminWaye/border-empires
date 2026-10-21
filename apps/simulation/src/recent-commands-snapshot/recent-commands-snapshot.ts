import type { SimulationCommandStore } from "../command-store/command-store.js";

export type ProtoGetRecentCommandsRequest = {
  limit?: number;
};
export type ProtoGetRecentCommandsResponse = {
  ok: boolean;
  commands_json?: string;
};

// Hard ceiling regardless of what the caller asks for; this is a diagnostics
// view, not an export.
const MAX_RECENT_COMMANDS = 500;

/**
 * GetRecentCommands gRPC handler; extracted out of simulation-service.ts
 * (which is over the 500-line file budget and may not grow further — see
 * AGENTS.md's file-and-type-discipline rule) so that handler stays a
 * one-line call there.
 */
export const handleGetRecentCommands = (
  commandStore: SimulationCommandStore,
  call: { request: ProtoGetRecentCommandsRequest },
  callback: (error: Error | null, response: ProtoGetRecentCommandsResponse) => void
): void => {
  const requested = Math.floor(call.request.limit ?? 0);
  const limit = Math.min(requested > 0 ? requested : 100, MAX_RECENT_COMMANDS);
  void commandStore.loadRecentCommands(limit)
    .then((recentCommands) => {
      // SQLite picks rows by insertion order; keep the displayed order by queuedAt.
      const recent = recentCommands
        .sort((a, b) => b.queuedAt - a.queuedAt)
        .map((cmd) => ({
          playerId: cmd.playerId,
          type: cmd.type,
          commandId: cmd.commandId,
          issuedAt: cmd.queuedAt ?? 0
        }));
      callback(null, { ok: true, commands_json: JSON.stringify(recent) });
    })
    .catch((error) =>
      callback(error instanceof Error ? error : new Error("failed to load commands"), {
        ok: false,
        commands_json: ""
      })
    );
};
