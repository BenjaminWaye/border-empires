import crypto from "node:crypto";

import type { ClientCommandEnvelope, CommandQueuedMessage } from "@border-empires/client-protocol";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { GatewayCommandStore } from "./command-store.js";

type FrontierCommandType = "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK";

type FrontierCommandMessage = {
  type: FrontierCommandType;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  commandId?: string;
  clientSeq?: number;
};

export type GatewaySocketSession = {
  sessionId: string;
  playerId: string;
  nextClientSeq: number;
};

type SubmitFrontierCommandDeps = {
  createCommandId?: () => string;
  now?: () => number;
  commandStore: GatewayCommandStore;
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  sendJson: (payload: unknown) => void;
  recordGatewayEvent?: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
};

type SubmitDurableCommandMessage<TType extends ClientCommandEnvelope["type"]> = {
  type: TType;
  payload: ClientCommandEnvelope["payload"];
  commandId?: string;
  clientSeq?: number;
};

export type SubmitDurableCommandDeps = SubmitFrontierCommandDeps;

export const submitDurableCommand = async <TType extends ClientCommandEnvelope["type"]>(
  session: GatewaySocketSession,
  message: SubmitDurableCommandMessage<TType>,
  deps: SubmitDurableCommandDeps
): Promise<void> => {
  const createCommandId = deps.createCommandId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => Date.now());
  const clientSeq = typeof message.clientSeq === "number" ? message.clientSeq : session.nextClientSeq;
  const envelope: ClientCommandEnvelope = {
    commandId: message.commandId ?? createCommandId(),
    clientSeq,
    issuedAt: now(),
    type: message.type,
    payload: message.payload
  };
  session.nextClientSeq = Math.max(session.nextClientSeq, clientSeq + 1);

  const queuedMessage: CommandQueuedMessage = {
    type: "COMMAND_QUEUED",
    commandId: envelope.commandId,
    clientSeq: envelope.clientSeq
  };
  const durableCommand: CommandEnvelope = {
    commandId: envelope.commandId,
    clientSeq: envelope.clientSeq,
    issuedAt: envelope.issuedAt,
    type: envelope.type,
    sessionId: session.sessionId,
    playerId: session.playerId,
    payloadJson: JSON.stringify(envelope.payload)
  };

  deps.recordGatewayEvent?.("info", "gateway_command_queue_attempt", {
    sessionId: session.sessionId,
    playerId: session.playerId,
    commandId: durableCommand.commandId,
    clientSeq: durableCommand.clientSeq,
    type: durableCommand.type
  });

  const sendQueued = (queued: { commandId: string; clientSeq: number }): void => {
    deps.sendJson({
      ...queuedMessage,
      commandId: queued.commandId,
      clientSeq: queued.clientSeq
    });
  };

  const submitToSimulation = async (command: CommandEnvelope): Promise<void> => {
    try {
      await deps.submitCommand(command);
      deps.recordGatewayEvent?.("info", "gateway_command_submit", {
        sessionId: session.sessionId,
        playerId: session.playerId,
        commandId: command.commandId,
        clientSeq: command.clientSeq,
        type: command.type
      });
    } catch {
      await deps.commandStore.markRejected(
        command.commandId,
        now(),
        "SIMULATION_UNAVAILABLE",
        "command could not be queued in simulation"
      );
      deps.recordGatewayEvent?.("warn", "gateway_command_submit_failed", {
        sessionId: session.sessionId,
        playerId: session.playerId,
        commandId: command.commandId,
        clientSeq: command.clientSeq,
        type: command.type
      });
      deps.sendJson({
        type: "ERROR",
        commandId: command.commandId,
        code: "SIMULATION_UNAVAILABLE",
        message: "command could not be queued in simulation"
      });
    }
  };

  let storedQueued;
  try {
    storedQueued = await deps.commandStore.persistQueuedCommand(durableCommand, now());
  } catch {
    deps.recordGatewayEvent?.("error", "gateway_command_queue_persist_failed", {
      sessionId: session.sessionId,
      playerId: session.playerId,
      commandId: durableCommand.commandId,
      clientSeq: durableCommand.clientSeq,
      type: durableCommand.type
    });
    deps.sendJson({
      type: "ERROR",
      commandId: envelope.commandId,
      code: "QUEUE_PERSIST_FAILED",
      message: "command could not be persisted by gateway"
    });
    return;
  }

  if (storedQueued.commandId !== durableCommand.commandId) {
    if (storedQueued.status === "REJECTED" || storedQueued.status === "RESOLVED") {
      const recoveredClientSeq = await deps.commandStore.nextClientSeqForPlayer(session.playerId);
      const recoveredCommand: CommandEnvelope = {
        ...durableCommand,
        clientSeq: recoveredClientSeq
      };
      session.nextClientSeq = Math.max(session.nextClientSeq, recoveredClientSeq + 1);
      deps.recordGatewayEvent?.("warn", "gateway_command_stale_seq_recovered", {
        sessionId: session.sessionId,
        playerId: session.playerId,
        commandId: durableCommand.commandId,
        requestedClientSeq: durableCommand.clientSeq,
        recoveredClientSeq,
        collidedCommandId: storedQueued.commandId,
        collidedStatus: storedQueued.status
      });

      let recoveredQueued;
      try {
        recoveredQueued = await deps.commandStore.persistQueuedCommand(recoveredCommand, now());
      } catch {
        deps.recordGatewayEvent?.("error", "gateway_command_stale_seq_recover_persist_failed", {
          sessionId: session.sessionId,
          playerId: session.playerId,
          commandId: durableCommand.commandId,
          requestedClientSeq: durableCommand.clientSeq,
          recoveredClientSeq
        });
        deps.sendJson({
          type: "ERROR",
          commandId: durableCommand.commandId,
          code: "QUEUE_PERSIST_FAILED",
          message: "command could not be persisted by gateway"
        });
        return;
      }

      sendQueued({
        commandId: recoveredQueued.commandId,
        clientSeq: recoveredQueued.clientSeq
      });

      if (recoveredQueued.commandId !== recoveredCommand.commandId) {
        deps.recordGatewayEvent?.("warn", "gateway_command_stale_seq_recover_deduped", {
          sessionId: session.sessionId,
          playerId: session.playerId,
          requestedCommandId: recoveredCommand.commandId,
          queuedCommandId: recoveredQueued.commandId,
          clientSeq: recoveredQueued.clientSeq
        });
        return;
      }

      await submitToSimulation(recoveredCommand);
      return;
    }

    deps.recordGatewayEvent?.("info", "gateway_command_queue_replayed", {
      sessionId: session.sessionId,
      playerId: session.playerId,
      requestedCommandId: durableCommand.commandId,
      requestedClientSeq: durableCommand.clientSeq,
      queuedCommandId: storedQueued.commandId,
      queuedClientSeq: storedQueued.clientSeq,
      queuedStatus: storedQueued.status
    });
    sendQueued({
      commandId: storedQueued.commandId,
      clientSeq: storedQueued.clientSeq
    });
    return;
  }

  sendQueued({
    commandId: storedQueued.commandId,
    clientSeq: storedQueued.clientSeq
  });
  await submitToSimulation(durableCommand);
};

export const submitFrontierCommand = async (
  session: GatewaySocketSession,
  message: FrontierCommandMessage,
  deps: SubmitFrontierCommandDeps
): Promise<void> => {
  await submitDurableCommand(
    session,
    {
      type: message.type,
      payload: {
        fromX: message.fromX,
        fromY: message.fromY,
        toX: message.toX,
        toY: message.toY
      },
      ...(typeof message.commandId === "string" ? { commandId: message.commandId } : {}),
      ...(typeof message.clientSeq === "number" ? { clientSeq: message.clientSeq } : {})
    },
    deps
  );
};
