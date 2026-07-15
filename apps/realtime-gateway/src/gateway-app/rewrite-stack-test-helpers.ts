import type { RecoveredSimulationState } from "../../../simulation/src/event-recovery/event-recovery.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "../../../simulation/src/snapshot-store/snapshot-store.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";
process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "999";

export const silentLog = {
  info: () => undefined,
  error: () => undefined
};

export const firebaseJwtFor = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
};

export type TestWebSocket = {
  readonly readyState: number;
  readonly CLOSED: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
  addEventListener(type: "close", listener: () => void, options?: { once?: boolean }): void;
};

export type BufferedSocket = {
  socket: TestWebSocket;
  nextJsonMessage: (label: string) => Promise<Record<string, unknown>>;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

export const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 5_000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const openSocket = async (url: string): Promise<BufferedSocket> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  const queuedMessages: string[] = [];
  const pendingResolvers: Array<(payload: string) => void> = [];
  socket.addEventListener("message", (event) => {
    const nextResolver = pendingResolvers.shift();
    if (nextResolver) {
      nextResolver(event.data);
      return;
    }
    queuedMessages.push(event.data);
  });
  await withTimeout(
    `socket open (${url})`,
    new Promise<void>((resolve) => {
      socket.addEventListener("open", () => resolve(), { once: true });
    })
  );
  return {
    socket,
    nextJsonMessage: async (label: string) => {
      const queued = queuedMessages.shift();
      if (queued) return JSON.parse(queued) as Record<string, unknown>;
      const payload = await withTimeout(
        `message ${label}`,
        new Promise<string>((resolve) => {
          pendingResolvers.push(resolve);
        })
      );
      return JSON.parse(payload) as Record<string, unknown>;
    }
  };
};

export const closeSocket = async (socket: TestWebSocket): Promise<void> => {
  if (socket.readyState === socket.CLOSED) return;
  const closed = withTimeout(
    "socket close",
    new Promise<void>((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true });
    })
  );
  socket.close();
  await closed;
};

export const nextNonBootstrapMessage = async (
  socket: BufferedSocket,
  label: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await socket.nextJsonMessage(label);
    if (message.type === "PLAYER_UPDATE") {
      continue;
    }
    if (message.type === "TILE_DELTA_BATCH" && typeof message.commandId === "string" && message.commandId.startsWith("bootstrap:")) {
      continue;
    }
    return message;
  }
};

export const nextCommandMessage = async (
  socket: BufferedSocket,
  label: string,
  commandId: string,
  type?: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await nextNonBootstrapMessage(socket, label);
    if (message.commandId !== commandId) {
      continue;
    }
    if (typeof type === "string" && message.type !== type) {
      continue;
    }
    return message;
  }
};

export const nextTypedMessage = async (
  socket: BufferedSocket,
  label: string,
  type: string
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await nextNonBootstrapMessage(socket, label);
    if (message.type === type) return message;
  }
};

export const nextMatchingMessage = async (
  socket: BufferedSocket,
  label: string,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> => {
  for (;;) {
    const message = await nextNonBootstrapMessage(socket, label);
    if (predicate(message)) return message;
  }
};

export const waitUntil = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 1_000): Promise<void> => {
  const startedAt = Date.now();
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

export const flushScheduledTasks = (
  scheduled: Array<{ delayMs: number; task: () => void }>,
  startIndex = 0,
  maxRuns = 20
): void => {
  let runs = 0;
  for (let index = startIndex; index < scheduled.length && runs < maxRuns; index += 1) {
    scheduled[index]?.task();
    runs += 1;
  }
};

export const createStartupSnapshotStore = async (initialState: RecoveredSimulationState): Promise<InMemorySimulationSnapshotStore> => {
  const snapshotStore = new InMemorySimulationSnapshotStore();
  await snapshotStore.saveSnapshot({
    lastAppliedEventId: 0,
    snapshotSections: buildSimulationSnapshotSections({
      initialState,
      commands: [],
      eventsByCommandId: new Map()
    }),
    createdAt: 1_000
  });
  return snapshotStore;
};
