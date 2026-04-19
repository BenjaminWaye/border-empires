import type { ClientState } from "./client-state.js";

type FrontierActionState = Pick<ClientState, "actionCurrent" | "nextCommandClientSeq">;

const fallbackCommandId = (clientSeq: number, now: () => number): string => `frontier-${now()}-${clientSeq}`;

export const createNextFrontierCommandIdentity = (
  state: Pick<ClientState, "nextCommandClientSeq">,
  now: () => number = () => Date.now()
): { commandId: string; clientSeq: number } => {
  const clientSeq = state.nextCommandClientSeq;
  state.nextCommandClientSeq += 1;
  const commandId = globalThis.crypto?.randomUUID?.() ?? fallbackCommandId(clientSeq, now);
  return { commandId, clientSeq };
};

export const applyGatewayRecoveryNextClientSeq = (
  state: Pick<ClientState, "nextCommandClientSeq">,
  nextClientSeq: unknown
): void => {
  if (typeof nextClientSeq !== "number" || !Number.isFinite(nextClientSeq)) return;
  state.nextCommandClientSeq = Math.max(1, Math.trunc(nextClientSeq));
};

export const bindQueuedFrontierCommandIdentity = (
  state: FrontierActionState,
  message: { commandId?: unknown; clientSeq?: unknown }
): boolean => {
  if (typeof message.clientSeq === "number" && Number.isFinite(message.clientSeq)) {
    state.nextCommandClientSeq = Math.max(state.nextCommandClientSeq, Math.trunc(message.clientSeq) + 1);
  }
  if (!state.actionCurrent) return false;
  if (typeof message.clientSeq === "number" && Number.isFinite(message.clientSeq) && state.actionCurrent.clientSeq === Math.trunc(message.clientSeq)) {
    if (typeof message.commandId === "string" && message.commandId) state.actionCurrent.commandId = message.commandId;
    return true;
  }
  if (!state.actionCurrent.commandId && typeof message.commandId === "string" && message.commandId) {
    state.actionCurrent.commandId = message.commandId;
    return true;
  }
  return false;
};

export const matchesCurrentFrontierCommand = (
  state: Pick<ClientState, "actionCurrent">,
  commandId: unknown
): boolean => {
  if (typeof commandId !== "string" || !commandId) return true;
  return !state.actionCurrent?.commandId || state.actionCurrent.commandId === commandId;
};
