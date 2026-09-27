import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";

type TestWebSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 2_500): Promise<T> => {
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
  await withTimeout("socket open", new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true })));
  return socket;
};

const waitForMessage = (socket: TestWebSocket, label: string, predicate: (message: Record<string, unknown>) => boolean) =>
  withTimeout(
    label,
    new Promise<Record<string, unknown>>((resolve) => {
      socket.addEventListener("message", (event) => {
        const parsed = JSON.parse(event.data) as Record<string, unknown>;
        if (predicate(parsed)) resolve(parsed);
      });
    })
  );

// Shaped like a Firebase ID token payload. Anonymous accounts carry
// firebase.sign_in_provider "anonymous".
const firebaseToken = (claims: Record<string, unknown>): string =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

type PrepareCall = { playerId: string; options?: { isGuest?: boolean } };

const startApp = async (overrides: { joinGuestFull?: boolean } = {}) => {
  const prepareCalls: PrepareCall[] = [];
  const joinCalls: PrepareCall[] = [];
  const authBindingStore = new InMemoryGatewayAuthBindingStore();
  const app = await createRealtimeGatewayApp({
    logger: false,
    port: 0,
    commandStore: new InMemoryGatewayCommandStore(),
    authBindingStore,
    simulationClient: {
      preparePlayer: async (playerId, _rallyAnchor, options) => {
        prepareCalls.push({ playerId, ...(options ? { options } : {}) });
        return { playerId, spawned: false, joined: false };
      },
      joinSeason: async (playerId, _rallyAnchor, options) => {
        joinCalls.push({ playerId, ...(options ? { options } : {}) });
        return overrides.joinGuestFull
          ? { playerId, spawned: false, guestFull: true }
          : { playerId, spawned: true, joined: true };
      },
      submitCommand: async () => undefined,
      subscribePlayer: async (playerId) => ({ playerId, tiles: [] }),
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
  return { app, started, prepareCalls, joinCalls, authBindingStore };
};

const login = async (wsUrl: string, token: string): Promise<TestWebSocket> => {
  const socket = await openSocket(wsUrl);
  socket.send(JSON.stringify({ type: "AUTH", token }));
  await waitForMessage(socket, "INIT", (message) => message.type === "INIT");
  return socket;
};

describe("guest play in the gateway", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (openApps.length > 0) await openApps.pop()?.close();
  });

  it("marks an anonymous login as a guest on prepare and join, and relays GUEST_SLOTS_FULL", async () => {
    const { app, started, prepareCalls, joinCalls } = await startApp({ joinGuestFull: true });
    openApps.push(app);

    const socket = await login(started.wsUrl, firebaseToken({ user_id: "guest-uid-1", firebase: { sign_in_provider: "anonymous" } }));
    expect(prepareCalls).toEqual([{ playerId: "guest-uid-1", options: { isGuest: true } }]);

    socket.send(JSON.stringify({ type: "JOIN_SEASON" }));
    await expect(waitForMessage(socket, "guest full", (message) => message.type === "ERROR")).resolves.toMatchObject({
      code: "GUEST_SLOTS_FULL"
    });
    expect(joinCalls).toEqual([{ playerId: "guest-uid-1", options: { isGuest: true } }]);
    socket.close();
  });

  it("blocks alliance and truce requests from a guest", async () => {
    const { app, started } = await startApp();
    openApps.push(app);
    const socket = await login(started.wsUrl, firebaseToken({ user_id: "guest-uid-2", firebase: { sign_in_provider: "anonymous" } }));

    socket.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: "Someone" }));
    await expect(waitForMessage(socket, "alliance locked", (message) => message.type === "ERROR")).resolves.toMatchObject({
      code: "GUEST_DIPLOMACY_LOCKED"
    });
    socket.send(JSON.stringify({ type: "TRUCE_REQUEST", targetPlayerName: "Someone", durationHours: 12 }));
    await expect(
      waitForMessage(socket, "truce locked", (message) => message.type === "ERROR" && message.code === "GUEST_DIPLOMACY_LOCKED")
    ).resolves.toBeDefined();
    socket.close();
  });

  it("treats the same uid as upgraded once it logs in with a real account, even inside the identity cache window", async () => {
    const { app, started, prepareCalls, authBindingStore } = await startApp();
    openApps.push(app);

    const guestSocket = await login(started.wsUrl, firebaseToken({ user_id: "uid-3", firebase: { sign_in_provider: "anonymous" } }));
    guestSocket.close();
    const accountSocket = await login(
      started.wsUrl,
      firebaseToken({ user_id: "uid-3", email: "linked@example.com", firebase: { sign_in_provider: "google.com" } })
    );

    expect(prepareCalls.map((call) => call.options)).toEqual([{ isGuest: true }, { isGuest: false }]);
    expect(prepareCalls.every((call) => call.playerId === "uid-3")).toBe(true);
    await expect(authBindingStore.getByUid("uid-3")).resolves.toMatchObject({ playerId: "uid-3", email: "linked@example.com" });

    // No longer a guest, so diplomacy reaches social state (unknown target).
    accountSocket.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: "Nobody Here" }));
    const error = await waitForMessage(accountSocket, "alliance error", (message) => message.type === "ERROR");
    expect(error.code).not.toBe("GUEST_DIPLOMACY_LOCKED");
    accountSocket.close();
  });
});
