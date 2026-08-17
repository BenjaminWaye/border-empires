// Regression coverage for the bootstrap-admission slot leak hazard against the
// REAL createRealtimeGatewayApp() AUTH flow — not just admitBootstrap() in
// isolation (see bootstrap-admission.test.ts for the unit-level coverage).
// admitBootstrap()'s slot is now taken before PreparePlayer runs (moved there
// so PreparePlayer itself is throttled, not just subscribePlayer) and released
// in a `finally` spanning both RPCs. If a future edit reintroduces an early
// `return` between the increment and that `finally`, the slot leaks
// permanently: bootstrapsInFlight never comes back down, and every login
// after the first failure queues or gets SERVER_BUSY forever. This test
// forces that exact failure shape (prepare rejects with only one concurrent
// bootstrap slot and zero queue depth) and asserts a second, independent
// login still gets in immediately afterward.
import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";

type TestWebSocket = {
  readonly readyState: number;
  readonly CLOSED: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
  addEventListener(type: "close", listener: () => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 2_000): Promise<T> => {
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

const openSocket = async (url: string): Promise<TestWebSocket> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  await withTimeout(
    `socket open (${url})`,
    new Promise<void>((resolve) => {
      socket.addEventListener("open", () => resolve(), { once: true });
    })
  );
  return socket;
};

// A single persistent listener collecting every message, rather than a fresh
// once-listener per awaited message: prepare rejecting immediately (as this
// test's mock does) can dispatch several messages in one microtask burst,
// and a listener re-subscribed between iterations can miss one that arrives
// in the gap. Polling an ever-growing array has no such gap.
const collectMessages = (socket: TestWebSocket): Array<Record<string, unknown>> => {
  const messages: Array<Record<string, unknown>> = [];
  socket.addEventListener("message", (event) => messages.push(JSON.parse(event.data) as Record<string, unknown>));
  return messages;
};

// LOGIN_PHASE is progress-only noise sent throughout the AUTH handler and can
// arrive at almost any point between AUTH and INIT/ERROR — skip it so we
// don't grab it instead of the real reply.
const waitForRealMessage = (
  messages: Array<Record<string, unknown>>,
  label: string,
  timeoutMs?: number
): Promise<Record<string, unknown>> =>
  withTimeout(
    label,
    new Promise<Record<string, unknown>>((resolve) => {
      const intervalId = setInterval(() => {
        const found = messages.find((m) => m.type !== "LOGIN_PHASE");
        if (found) {
          clearInterval(intervalId);
          resolve(found);
        }
      }, 10);
    }),
    timeoutMs
  );

const connectedStream = (_listener?: unknown, options?: { onConnect?: () => void; onDisconnect?: (error: Error | null) => void }) => {
  options?.onConnect?.();
  return () => undefined;
};

describe("gateway bootstrap admission — slot release across a real AUTH failure", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];
  const envBackup = {
    maxConcurrentBootstraps: process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS,
    maxLoginQueueSize: process.env.GATEWAY_MAX_LOGIN_QUEUE_SIZE
  };

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
    if (typeof envBackup.maxConcurrentBootstraps === "string") process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = envBackup.maxConcurrentBootstraps;
    else delete process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS;
    if (typeof envBackup.maxLoginQueueSize === "string") process.env.GATEWAY_MAX_LOGIN_QUEUE_SIZE = envBackup.maxLoginQueueSize;
    else delete process.env.GATEWAY_MAX_LOGIN_QUEUE_SIZE;
  });

  it("does not leak the bootstrap slot when PreparePlayer rejects, so the next login is not shut out", async () => {
    // Only one bootstrap slot, and nowhere to queue: if the first (failing)
    // attempt leaks its slot, the second attempt below gets SERVER_BUSY
    // instead of getting in. Must be set BEFORE createRealtimeGatewayApp —
    // maxConcurrentBootstraps/maxLoginQueueSize are read from process.env
    // once, synchronously, at app-construction time.
    process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "1";
    process.env.GATEWAY_MAX_LOGIN_QUEUE_SIZE = "0";

    let prepareCalls = 0;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationPrepareTimeoutMs: 1_000,
      simulationRpcRetryAttempts: 1,
      simulationClient: {
        preparePlayer: async () => {
          prepareCalls += 1;
          if (prepareCalls === 1) throw new Error("simulated PreparePlayer RPC failure");
          return { playerId: "player-1", spawned: false };
        },
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({ playerId: "player-1", tiles: [] }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const firstSocket = await openSocket(started.wsUrl);
    const firstMessages = collectMessages(firstSocket);
    firstSocket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    // buildServerStartingErrorPayload always sends code SERVER_STARTING for a
    // prepare/subscribe RPC failure (see the existing "fails AUTH quickly
    // when simulation prepare hangs" test) — the underlying RPC error text
    // isn't surfaced to the client, only that admission was granted and then
    // the RPC itself failed, which is exactly the path this test needs to hit.
    await expect(waitForRealMessage(firstMessages, "first login prepare failure")).resolves.toMatchObject({
      type: "ERROR",
      code: "SERVER_STARTING"
    });
    firstSocket.close();

    const secondSocket = await openSocket(started.wsUrl);
    const secondMessages = collectMessages(secondSocket);
    secondSocket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    // The bug this guards against: if the slot leaked, this resolves to
    // SERVER_BUSY (queue_full) instead of a successful INIT.
    await expect(waitForRealMessage(secondMessages, "second login after first failure")).resolves.toMatchObject({
      type: "INIT"
    });
    expect(prepareCalls).toBe(2);

    secondSocket.close();
  });
});
