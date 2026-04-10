import type { Ws } from "./server-runtime-config.js";

type LowPrioritySocketState = {
  queue: string[];
  draining: boolean;
  pauseUntil: number;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const LOW_PRIORITY_BUFFER_LIMIT_BYTES = 128 * 1024;
const LOW_PRIORITY_RETRY_MS = 25;
const LOW_PRIORITY_SEND_YIELD_MS = 5;

const lowPriorityStateBySocket = new WeakMap<Ws, LowPrioritySocketState>();

const getLowPriorityState = (socket: Ws): LowPrioritySocketState => {
  const existing = lowPriorityStateBySocket.get(socket);
  if (existing) return existing;
  const created: LowPrioritySocketState = {
    queue: [],
    draining: false,
    pauseUntil: 0,
    timer: undefined
  };
  lowPriorityStateBySocket.set(socket, created);
  return created;
};

const clearLowPriorityTimer = (state: LowPrioritySocketState): void => {
  if (state.timer === undefined) return;
  clearTimeout(state.timer);
  state.timer = undefined;
};

const scheduleLowPriorityDrain = (socket: Ws, delayMs: number): void => {
  const state = getLowPriorityState(socket);
  clearLowPriorityTimer(state);
  state.timer = setTimeout(() => {
    state.timer = undefined;
    drainLowPrioritySocketMessages(socket);
  }, Math.max(0, delayMs));
};

export const sendHighPrioritySocketMessage = (socket: Ws | undefined, payload: string): void => {
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(payload);
};

export const pauseLowPrioritySocketMessages = (
  socket: Ws | undefined,
  pauseUntil: number,
  options?: { dropQueued?: boolean }
): void => {
  if (!socket) return;
  const state = getLowPriorityState(socket);
  if (options?.dropQueued) state.queue.length = 0;
  if (pauseUntil > state.pauseUntil) state.pauseUntil = pauseUntil;
  if (state.queue.length > 0) scheduleLowPriorityDrain(socket, pauseUntil - Date.now());
};

export const enqueueLowPrioritySocketMessage = (socket: Ws | undefined, payload: string): void => {
  if (!socket || socket.readyState !== socket.OPEN) return;
  const state = getLowPriorityState(socket);
  state.queue.push(payload);
  drainLowPrioritySocketMessages(socket);
};

const drainLowPrioritySocketMessages = (socket: Ws): void => {
  const state = getLowPriorityState(socket);
  if (state.draining) return;
  if (socket.readyState !== socket.OPEN) {
    clearLowPriorityTimer(state);
    state.queue.length = 0;
    return;
  }
  if (state.queue.length === 0) return;
  const nowMs = Date.now();
  if (nowMs < state.pauseUntil) {
    scheduleLowPriorityDrain(socket, state.pauseUntil - nowMs);
    return;
  }
  if (socket.bufferedAmount > LOW_PRIORITY_BUFFER_LIMIT_BYTES) {
    scheduleLowPriorityDrain(socket, LOW_PRIORITY_RETRY_MS);
    return;
  }
  const nextPayload = state.queue.shift();
  if (!nextPayload) return;
  state.draining = true;
  try {
    socket.send(nextPayload);
  } finally {
    state.draining = false;
  }
  if (state.queue.length > 0) scheduleLowPriorityDrain(socket, LOW_PRIORITY_SEND_YIELD_MS);
};
