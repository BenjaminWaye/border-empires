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

  let storedQueued;
  try {
    storedQueued = await deps.commandStore.persistQueuedCommand(durableCommand, now());
  } catch {
    deps.sendJson({
      type: "ERROR",
      commandId: envelope.commandId,
      code: "QUEUE_PERSIST_FAILED",
      message: "command could not be persisted by gateway"
    });
    return;
  }

  deps.sendJson({
    ...queuedMessage,
    commandId: storedQueued.commandId,
    clientSeq: storedQueued.clientSeq
  });

  if (storedQueued.commandId !== envelope.commandId) {
    return;
  }

  try {
    await deps.submitCommand(durableCommand);
  } catch {
    await deps.commandStore.markRejected(
      envelope.commandId,
      now(),
      "SIMULATION_UNAVAILABLE",
      "command could not be queued in simulation"
    );
    deps.sendJson({
      type: "ERROR",
      commandId: envelope.commandId,
      code: "SIMULATION_UNAVAILABLE",
      message: "command could not be queued in simulation"
    });
  }
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
