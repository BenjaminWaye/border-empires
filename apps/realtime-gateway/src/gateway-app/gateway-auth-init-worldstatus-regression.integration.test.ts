import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { openSocket, nextNonBootstrapMessage, closeSocket, type BufferedSocket } from "./rewrite-stack-test-helpers.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";
process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "999";

const connectedStream = (_listener?: unknown, options?: { onConnect?: () => void; onDisconnect?: (error: Error | null) => void }) => {
  options?.onConnect?.();
  return () => undefined;
};

describe("gateway auth INIT freshness regression", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("refreshes stale tiles from the live subscribe without blanking the bootstrap's worldStatus/leaderboard", async () => {
    // Regression guard for the fix that refreshes initialState from the live
    // subscription right before buildInitMessage (see gateway-app.ts's
    // build_init step). An earlier version of that fix swapped the WHOLE
    // initialState object for playerSubscriptions.snapshotForPlayer(...) --
    // but the live subscribe RPC (mode !== "bootstrap-only") never sets
    // includeWorldStatus, so its snapshot has no worldStatus at all on a
    // fresh subscribe. That wholesale swap would blank the leaderboard on
    // every first login. The fix must refresh only .tiles, keeping
    // worldStatus/leaderboard from the authoritative bootstrap snapshot.
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async (playerId) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId, subscriptionJson = "{}") => {
          const parsed = JSON.parse(subscriptionJson) as { mode?: string };
          if (parsed.mode === "bootstrap-only") {
            // Authoritative bootstrap: stale tile ownership (as if a barbarian
            // expansion landed during the multi-second bootstrap RPC), but a
            // real worldStatus/leaderboard.
            return {
              playerId,
              tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }],
              worldStatus: {
                leaderboard: {
                  overall: [{ id: playerId, name: "Distinctive Leader", tiles: 99, incomePerMinute: 5, techs: 2, score: 500, rank: 1 }],
                  byTiles: [],
                  byIncome: [],
                  byTechs: []
                },
                seasonVictory: []
              }
            };
          }
          // Live subscribe: fresher tile ownership (the barbarian expansion
          // landed), but no worldStatus -- matches the real gateway's
          // buildAndCachePlayerSnapshotAsync call for live subscribes, which
          // never passes includeWorldStatus: true.
          return {
            playerId,
            tiles: [{ x: 10, y: 10, ownerId: "barbarian-1", ownershipState: "SETTLED" }]
          };
        },
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: connectedStream
      }
    });
    const started = await app.start();
    openApps.push(app);

    const buffered: BufferedSocket = await openSocket(started.wsUrl);
    const initMessage = nextNonBootstrapMessage(buffered, "init after auth");
    buffered.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    const init = await initMessage;

    expect(init.type).toBe("INIT");
    const initialState = init.initialState as { tiles: Array<{ x: number; y: number; ownerId?: string }> };
    // Tiles reflect the fresher live-subscribe ownership, not the stale bootstrap tile.
    expect(initialState.tiles.find((tile) => tile.x === 10 && tile.y === 10)?.ownerId).toBe("barbarian-1");
    // Leaderboard still comes from the bootstrap's worldStatus -- proving the
    // refresh did not discard it in favor of the live snapshot's (missing) one.
    const leaderboard = init.leaderboard as { overall: Array<{ id: string; name: string }> };
    expect(leaderboard.overall.some((entry) => entry.name === "Distinctive Leader")).toBe(true);

    await closeSocket(buffered.socket);
  });
});
