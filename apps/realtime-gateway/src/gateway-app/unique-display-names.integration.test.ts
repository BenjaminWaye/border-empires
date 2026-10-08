import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { connect, createTestFirebaseTokens, type Client, type Message } from "./gateway-test-client.js";

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
  const { verifier, sign } = await createTestFirebaseTokens();
  const app = await createRealtimeGatewayApp({
    logger: false,
    port: 0,
    commandStore: new InMemoryGatewayCommandStore(),
    firebaseTokenVerifier: verifier,
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
  return { app, wsUrl: started.wsUrl, sign };
};

const login = async (
  wsUrl: string,
  claims: Record<string, unknown> & { sub: string },
  sign: (claims: Record<string, unknown> & { sub: string }) => Promise<string>
): Promise<{ client: Client; init: Message }> => {
  const client = await connect(wsUrl);
  client.socket.send(JSON.stringify({ type: "AUTH", token: await sign(claims) }));
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
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);

    const anonymous = await login(wsUrl, { sub: "uid-anon" }, sign);
    const named = await login(wsUrl, { sub: "uid-named", name: "Ada Lovelace" }, sign);

    expect((anonymous.init.player as { suggestedName?: string }).suggestedName).toMatch(/^House [A-Z][a-z]+$/);
    expect((named.init.player as { suggestedName?: string }).suggestedName).toBe("Ada Lovelace");
    anonymous.client.socket.close();
    named.client.socket.close();
  });

  it("rejects a name another player holds, however it is cased or spaced, and offers a free one", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);
    const first = await login(wsUrl, { sub: "uid-1" }, sign);
    const second = await login(wsUrl, { sub: "uid-2" }, sign);

    setProfile(first.client, "House Ashgrove", "#000033");
    await first.client.waitFor("first saved", saved("House Ashgrove"));

    setProfile(second.client, "  house   ASHGROVE ", "#330022");
    const rejection = await second.client.waitFor("name taken", nameTaken);
    expect(rejection.suggestion).toBe("house ASHGROVE II");

    setProfile(second.client, rejection.suggestion as string, "#330022");
    await second.client.waitFor("second saved with suggestion", saved(rejection.suggestion as string));
    first.client.socket.close();
    second.client.socket.close();
  });

  it("lets exactly one of two simultaneous claims on the same name win", async () => {
    const { app, wsUrl, sign } = await startApp({ slowProfileStore: true });
    openApps.push(app);
    const a = await login(wsUrl, { sub: "uid-a" }, sign);
    const b = await login(wsUrl, { sub: "uid-b" }, sign);

    setProfile(a.client, "House Valmont", "#002200");
    setProfile(b.client, "House Valmont", "#770066");
    const outcomeOf = async (client: Client) =>
      (await client.waitFor("outcome", (message) => saved("House Valmont")(message) || nameTaken(message))).type;
    const outcomes = await Promise.all([outcomeOf(a.client), outcomeOf(b.client)]);

    expect(outcomes.filter((type) => type === "PLAYER_UPDATE")).toHaveLength(1);
    expect(outcomes.filter((type) => type === "ERROR")).toHaveLength(1);
    a.client.socket.close();
    b.client.socket.close();
  });

  it("never blocks a player on the name they already hold", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);
    const player = await login(wsUrl, { sub: "uid-keeper" }, sign);

    setProfile(player.client, "House Corthorne", "#000077");
    await player.client.waitFor("saved", saved("House Corthorne"));
    const before = player.client.messages.length;
    setProfile(player.client, "house corthorne", "#000077");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(player.client.messages.slice(before).some(nameTaken)).toBe(false);
    player.client.socket.close();
  });

  it("rejects reserved names", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);
    const player = await login(wsUrl, { sub: "uid-reserved" }, sign);

    for (const name of ["Barbarians", "AI 3"]) {
      const before = player.client.messages.length;
      setProfile(player.client, name, "#110000");
      await player.client.waitFor(`reserved ${name}`, (message) => nameTaken(message) && player.client.messages.indexOf(message) >= before);
    }
    player.client.socket.close();
  });
});
