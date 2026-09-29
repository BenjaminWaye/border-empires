import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { connect, createTestFirebaseTokens, type Client, type Message } from "./gateway-test-client.js";

const startApp = async () => {
  const { verifier, sign } = await createTestFirebaseTokens();
  const app = await createRealtimeGatewayApp({
    logger: false,
    port: 0,
    commandStore: new InMemoryGatewayCommandStore(),
    firebaseTokenVerifier: verifier,
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

const guestClaims = (uid: string) => ({ sub: uid, firebase: { sign_in_provider: "anonymous", identities: {} } });
const accountClaims = (uid: string, name?: string) => ({
  sub: uid,
  email: `${uid}@example.com`,
  ...(name ? { name } : {}),
  firebase: { sign_in_provider: "google.com", identities: {} }
});

const login = async (
  wsUrl: string,
  claims: Record<string, unknown> & { sub: string },
  sign: (claims: Record<string, unknown> & { sub: string }) => Promise<string>
): Promise<{ client: Client; player: Record<string, unknown> }> => {
  const client = await connect(wsUrl);
  client.socket.send(JSON.stringify({ type: "AUTH", token: await sign(claims) }));
  const init = await client.waitFor("INIT", (message) => message.type === "INIT");
  return { client, player: init.player as Record<string, unknown> };
};

const styleOf = (playerId: string) => (message: Message) => message.type === "PLAYER_STYLE" && message.playerId === playerId;

describe("guest profiles", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (openApps.length > 0) await openApps.pop()?.close();
  });

  it("gives a guest a numbered name and a colour at login and skips the setup step", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);

    const first = await login(wsUrl, guestClaims("guest-1"), sign);
    const second = await login(wsUrl, guestClaims("guest-2"), sign);

    expect(first.player).toMatchObject({ name: "House Noname 1", profileNeedsSetup: false });
    expect(second.player).toMatchObject({ name: "House Noname 2", profileNeedsSetup: false });
    expect(first.player.tileColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(second.player.tileColor).not.toBe(first.player.tileColor);
    expect(first.player.suggestedName).toBeUndefined();
    first.client.socket.close();
    second.client.socket.close();
  });

  it("keeps the same name when the same guest comes back", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);

    const first = await login(wsUrl, guestClaims("guest-back"), sign);
    first.client.socket.close();
    const again = await login(wsUrl, guestClaims("guest-back"), sign);

    expect(again.player).toMatchObject({ name: first.player.name, tileColor: first.player.tileColor, profileNeedsSetup: false });
    again.client.socket.close();
  });

  it("tells players who are already online about the new guest's name and colour", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);
    const observer = await login(wsUrl, accountClaims("observer", "Ada Lovelace"), sign);

    const guest = await login(wsUrl, guestClaims("guest-seen"), sign);

    const style = await observer.client.waitFor("guest style", styleOf("guest-seen"));
    expect(style).toMatchObject({ name: "House Noname 1", tileColor: guest.player.tileColor });
    observer.client.socket.close();
    guest.client.socket.close();
  });

  it("still sends real accounts through the setup step", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);

    const account = await login(wsUrl, accountClaims("account-1"), sign);

    expect(account.player.profileNeedsSetup).toBe(true);
    expect(account.player.suggestedName).toMatch(/^House /);
    account.client.socket.close();
  });

  it("does not let a real player take a guest-style name", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);
    const account = await login(wsUrl, accountClaims("account-2"), sign);

    account.client.socket.send(JSON.stringify({ type: "SET_PROFILE", displayName: "House Noname 9", color: "#010203" }));

    await expect(account.client.waitFor("reserved", (m) => m.type === "ERROR" && m.code === "NAME_TAKEN")).resolves.toBeDefined();
    account.client.socket.close();
  });

  it("asks a guest who saves their empire for a real name, lets them keep the empire's colour choice, and frees their number", async () => {
    const { app, wsUrl, sign } = await startApp();
    openApps.push(app);
    const guest = await login(wsUrl, guestClaims("guest-up"), sign);
    guest.client.socket.close();

    const upgraded = await login(wsUrl, accountClaims("guest-up", "Grace Hopper"), sign);

    expect(upgraded.player).toMatchObject({ profileNeedsSetup: true, suggestedName: "Grace Hopper" });
    upgraded.client.socket.send(JSON.stringify({ type: "SET_PROFILE", displayName: "House Ashgrove", color: "#0a0b0c" }));
    const saved = await upgraded.client.waitFor("saved", (m) => m.type === "PLAYER_UPDATE" && m.name === "House Ashgrove");
    expect(saved).toMatchObject({ profileNeedsSetup: false });
    upgraded.client.socket.close();

    const nextGuest = await login(wsUrl, guestClaims("guest-next"), sign);
    expect(nextGuest.player.name).toBe("House Noname 1");
    nextGuest.client.socket.close();
  });
});
