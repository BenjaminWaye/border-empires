import type { SimulationCommandStore } from "./command-store/command-store.js";

export type ProtoGetRecentCommandsRequest = {
  limit?: number;
};
export type ProtoGetRecentCommandsResponse = {
  ok: boolean;
  commands_json?: string;
};

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
  const limit = call.request.limit && call.request.limit > 0 ? call.request.limit : 100;
  void commandStore.loadAllCommands()
    .then((allCommands) => {
      const recent = allCommands
        .sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0))
        .slice(0, limit)
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
