import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";

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

const waitForMessage = async <T extends Record<string, unknown>>(
  socket: TestWebSocket,
  label: string,
  predicate: (message: T) => boolean,
  timeoutMs = 2_500
): Promise<T> =>
  withTimeout(
    label,
    new Promise<T>((resolve) => {
      const onMessage = (event: { data: string }) => {
        const parsed = JSON.parse(event.data) as T;
        if (!predicate(parsed)) return;
        resolve(parsed);
      };
      socket.addEventListener("message", onMessage);
    }),
    timeoutMs
  );

// Regression for a dispatch-gate bug: gateway-app.ts used to keep two
// independently-maintained lists of "migrated" command types — one to build
// the legacy-ignore set, one to gate the final dispatch switch. The lists had
// drifted: AEGIS_LOCK and ASTRAL_DOCK_LAUNCH were present in the dispatch
// gate but missing from the legacy-ignore exclusion, so both message types
// were silently swallowed as "ignored legacy message" (no response sent at
// all) before ever reaching submitDurableCommand. A single canonical list
// (migrated-command-types.ts) now backs both checks.
describe("migrated command dispatch regression", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("does not silently drop AEGIS_LOCK and ASTRAL_DOCK_LAUNCH as legacy messages", async () => {
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async () => ({ playerId: "player-1", spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async () => ({ playerId: "player-1", tiles: [] }),
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: (_listener, options) => {
          options?.onConnect?.();
          return () => undefined;
        }
      }
    });
    const started = await app.start();
    openApps.push(app);

    const socket = await openSocket(started.wsUrl);
    socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await expect(waitForMessage(socket, "init", (message) => message.type === "INIT")).resolves.toMatchObject({
      type: "INIT"
    });

    socket.send(JSON.stringify({ type: "AEGIS_LOCK", fromX: 20, fromY: 20, commandId: "aegis-lock-cmd-1", clientSeq: 1 }));
    await expect(
      waitForMessage(socket, "aegis lock queued", (message) => message.type === "COMMAND_QUEUED")
    ).resolves.toMatchObject({ type: "COMMAND_QUEUED", commandId: "aegis-lock-cmd-1" });

    socket.send(
      JSON.stringify({ type: "ASTRAL_DOCK_LAUNCH", fromX: 20, fromY: 20, commandId: "astral-dock-cmd-1", clientSeq: 2 })
    );
    await expect(
      waitForMessage(socket, "astral dock launch queued", (message) => message.type === "COMMAND_QUEUED")
    ).resolves.toMatchObject({ type: "COMMAND_QUEUED", commandId: "astral-dock-cmd-1" });

    socket.close();
  });
});
