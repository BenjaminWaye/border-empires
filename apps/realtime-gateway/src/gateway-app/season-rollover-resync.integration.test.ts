import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { connect, createTestFirebaseTokens } from "./gateway-test-client.js";

// Regression: the simulation announces a season rollover as a PLAYER_MESSAGE with
// no player id. The gateway routes player messages by player id, found no sockets
// for "", and dropped it, so a connected client never learned the season changed
// and kept showing the old season's leaderboard and map.
describe("season rollover", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    delete process.env.GATEWAY_SEASON_ROLLOVER_SPREAD_MS;
    delete process.env.GATEWAY_SEASON_ROLLOVER_MIN_DELAY_MS;
    while (openApps.length > 0) await openApps.pop()?.close();
  });

  it("closes every socket of every connected player so each client reconnects into the new season", async () => {
    process.env.GATEWAY_SEASON_ROLLOVER_SPREAD_MS = "0"; // no stagger, no floor
    process.env.GATEWAY_SEASON_ROLLOVER_MIN_DELAY_MS = "0";
    const { verifier, sign } = await createTestFirebaseTokens();
    let emitSimulationEvent: ((event: SimulationClientEvent) => void) | undefined;
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
        streamEvents: (listener, options) => {
          options?.onConnect?.();
          emitSimulationEvent = listener;
          return () => undefined;
        }
      }
    });
    const started = await app.start();
    openApps.push(app);

    // Two sockets for one player (control and bulk channels, or two tabs).
    const token = await sign({ sub: "player-rollover", email: "p@example.com", firebase: { sign_in_provider: "google.com", identities: {} } });
    const closedPromises: Array<Promise<{ code: number; reason: string }>> = [];
    for (let index = 0; index < 2; index += 1) {
      const client = await connect(started.wsUrl);
      client.socket.send(JSON.stringify({ type: "AUTH", token }));
      await client.waitFor("INIT", (message) => message.type === "INIT");
      closedPromises.push(
        new Promise((resolve) => {
          (client.socket as unknown as { addEventListener: (type: "close", listener: (event: { code: number; reason: string }) => void) => void })
            .addEventListener("close", (event) => resolve({ code: event.code, reason: event.reason }));
        })
      );
    }

    emitSimulationEvent?.({
      eventType: "PLAYER_MESSAGE",
      commandId: "season-rollover:1",
      playerId: "",
      messageType: "SYSTEM",
      payload: { type: "SEASON_ROLLOVER", seasonId: "season-34" }
    });

    await expect(Promise.all(closedPromises)).resolves.toEqual([
      { code: 4009, reason: "season_rollover" },
      { code: 4009, reason: "season_rollover" }
    ]);
  });
});
