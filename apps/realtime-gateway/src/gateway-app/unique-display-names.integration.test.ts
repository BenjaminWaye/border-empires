import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";

type TestWebSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: { data: string }) => void, options?: { once?: boolean }): void;
};

const WebSocketCtor = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => TestWebSocket }).WebSocket;

const withTimeout = async <T>(label: string, task: Promise<T>, timeoutMs = 3_000): Promise<T> => {
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

type Message = Record<string, unknown>;

// Every message is recorded from the moment the socket opens, so a reply that
// arrives before a waiter is attached is never missed.
type Client = { socket: TestWebSocket; messages: Message[]; waitFor: (label: string, predicate: (message: Message) => boolean) => Promise<Message> };

const connect = async (url: string): Promise<Client> => {
  if (!WebSocketCtor) throw new Error("global WebSocket is unavailable in this runtime");
  const socket = new WebSocketCtor(url);
  const messages: Message[] = [];
  const waiters: Array<{ predicate: (message: Message) => boolean; resolve: (message: Message) => void }> = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data) as Message;
    messages.push(message);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i]!.predicate(message)) waiters.splice(i, 1)[0]!.resolve(message);
    }
  });
  await withTimeout("socket open", new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true })));
  return {
    socket,
    messages,
    waitFor: (label, predicate) => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return withTimeout(label, new Promise<Message>((resolve) => waiters.push({ predicate, resolve })));
    }
  };
};

const firebaseToken = (claims: Record<string, unknown>): string =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

// A store whose reads yield to the event loop for real. The in-memory store
// resolves entirely in microtasks, so one SET_PROFILE would always finish
// before another socket's message is even read, and no race could show up.
class SlowProfileStore extends InMemoryGatewayPlayerProfileStore {
  override async listAllNamed() {
    const rows = await super.listAllNamed();
    await new Promise((resolve) => setTimeout(resolve, 30));
    return rows;
  }

  // The write is what opens the race window: until it lands, a second
  // request's check sees no trace of the first claim.
  override async setProfile(...args: Parameters<InMemoryGatewayPlayerProfileStore["setProfile"]>) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return super.setProfile(...args);
  }
}

const startApp = async (options: { slowProfileStore?: boolean } = {}) => {
  const app = await createRealtimeGatewayApp({
    logger: false,
    port: 0,
    commandStore: new InMemoryGatewayCommandStore(),
    ...(options.slowProfileStore ? { profileStore: new SlowProfileStore() } : {}),
    simulationClient: {
      preparePlayer: async (playerId: string) => ({ playerId, spawned: false, joined: false }),
      submitCommand: async () => undefined,
      subscribePlayer: async (playerId: string) => ({ playerId, tiles: [] }),
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
  return { app, wsUrl: started.wsUrl };
};

const login = async (wsUrl: string, claims: Record<string, unknown>): Promise<{ client: Client; init: Message }> => {
  const client = await connect(wsUrl);
  client.socket.send(JSON.stringify({ type: "AUTH", token: firebaseToken(claims) }));
  const init = await client.waitFor("INIT", (message) => message.type === "INIT");
  return { client, init };
};

const setProfile = (client: Client, displayName: string, color: string): void =>
  client.socket.send(JSON.stringify({ type: "SET_PROFILE", displayName, color }));

const saved = (name: string) => (message: Message) => message.type === "PLAYER_UPDATE" && message.name === name;
const nameTaken = (message: Message) => message.type === "ERROR" && message.code === "NAME_TAKEN";

describe("unique display names", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (openApps.length > 0) await openApps.pop()?.close();
  });

  it("suggests a free house name at INIT for a new player with no real name, and keeps a real free name", async () => {
    const { app, wsUrl } = await startApp();
    openApps.push(app);

    const anonymous = await login(wsUrl, { user_id: "uid-anon" });
    const named = await login(wsUrl, { user_id: "uid-named", name: "Ada Lovelace" });

    expect((anonymous.init.player as { suggestedName?: string }).suggestedName).toMatch(/^House [A-Z][a-z]+$/);
    expect((named.init.player as { suggestedName?: string }).suggestedName).toBe("Ada Lovelace");
    anonymous.client.socket.close();
    named.client.socket.close();
  });

  it("rejects a name another player holds, however it is cased or spaced, and offers a free one", async () => {
    const { app, wsUrl } = await startApp();
    openApps.push(app);
    const first = await login(wsUrl, { user_id: "uid-1" });
    const second = await login(wsUrl, { user_id: "uid-2" });

    setProfile(first.client, "House Ashgrove", "#112233");
    await first.client.waitFor("first saved", saved("House Ashgrove"));

    setProfile(second.client, "  house   ASHGROVE ", "#445566");
    const rejection = await second.client.waitFor("name taken", nameTaken);
    expect(rejection.suggestion).toBe("house ASHGROVE II");

    setProfile(second.client, rejection.suggestion as string, "#445566");
    await second.client.waitFor("second saved with suggestion", saved(rejection.suggestion as string));
    first.client.socket.close();
    second.client.socket.close();
  });

  it("lets exactly one of two simultaneous claims on the same name win", async () => {
    const { app, wsUrl } = await startApp({ slowProfileStore: true });
    openApps.push(app);
    const a = await login(wsUrl, { user_id: "uid-a" });
    const b = await login(wsUrl, { user_id: "uid-b" });

    setProfile(a.client, "House Valmont", "#111111");
    setProfile(b.client, "House Valmont", "#222222");
    const outcomeOf = async (client: Client) =>
      (await client.waitFor("outcome", (message) => saved("House Valmont")(message) || nameTaken(message))).type;
    const outcomes = await Promise.all([outcomeOf(a.client), outcomeOf(b.client)]);

    expect(outcomes.filter((type) => type === "PLAYER_UPDATE")).toHaveLength(1);
    expect(outcomes.filter((type) => type === "ERROR")).toHaveLength(1);
    a.client.socket.close();
    b.client.socket.close();
  });

  it("never blocks a player on the name they already hold", async () => {
    const { app, wsUrl } = await startApp();
    openApps.push(app);
    const player = await login(wsUrl, { user_id: "uid-keeper" });

    setProfile(player.client, "House Corthorne", "#123456");
    await player.client.waitFor("saved", saved("House Corthorne"));
    const before = player.client.messages.length;
    setProfile(player.client, "house corthorne", "#123456");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(player.client.messages.slice(before).some(nameTaken)).toBe(false);
    player.client.socket.close();
  });

  it("rejects reserved names", async () => {
    const { app, wsUrl } = await startApp();
    openApps.push(app);
    const player = await login(wsUrl, { user_id: "uid-reserved" });

    for (const name of ["Barbarians", "AI 3"]) {
      const before = player.client.messages.length;
      setProfile(player.client, name, "#778899");
      await player.client.waitFor(`reserved ${name}`, (message) => nameTaken(message) && player.client.messages.indexOf(message) >= before);
    }
    player.client.socket.close();
  });
});
