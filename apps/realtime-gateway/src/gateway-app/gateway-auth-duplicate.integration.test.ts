import { afterEach, describe, expect, it } from "vitest";

import { createRealtimeGatewayApp } from "./gateway-app.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { openSocket, nextNonBootstrapMessage, waitUntil, closeSocket, type BufferedSocket } from "./rewrite-stack-test-helpers.js";

process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS = "0";
process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS = "999";

const connectedStream = (_listener?: unknown, options?: { onConnect?: () => void; onDisconnect?: (error: Error | null) => void }) => {
  options?.onConnect?.();
  return () => undefined;
};

describe("gateway auth duplicate handling", () => {
  const openApps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (openApps.length > 0) {
      await openApps.pop()?.close();
    }
  });

  it("ignores a duplicate AUTH sent on the same socket before the first login completes", async () => {
    // Regression guard: a duplicate AUTH on one socket (e.g. a client retry
    // racing the original send) previously ran two full, concurrent login
    // pipelines — two bootstrap_subscribe + live_subscribe RPC pairs — which
    // doubled snapshot-build work and could leave the socket's subscription
    // state torn between the two attempts. Only the first AUTH should reach
    // the simulation; the second must be dropped while the first is in flight.
    let prepareCallCount = 0;
    let liveSubscribeCallCount = 0;
    let releaseSubscribe: (() => void) | undefined;
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async (playerId) => {
          prepareCallCount += 1;
          return { playerId, spawned: false };
        },
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId, subscriptionJson = "{}") => {
          const parsed = JSON.parse(subscriptionJson) as { mode?: string };
          if (parsed.mode === "bootstrap-only") {
            return { playerId, tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }] };
          }
          liveSubscribeCallCount += 1;
          // Hold the live subscribe open just long enough for the duplicate
          // AUTH to have a chance to race in before the first login finishes.
          await new Promise<void>((resolve) => { releaseSubscribe = resolve; });
          return { playerId, tiles: [{ x: 10, y: 10, ownerId: playerId, ownershipState: "SETTLED" }] };
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
    const initMessage = nextNonBootstrapMessage(buffered, "init after duplicate auth");

    buffered.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await waitUntil(() => liveSubscribeCallCount === 1, 2_000);
    // Second AUTH races in while the first login is still mid-flight. Give it
    // real time to round-trip over the socket and be processed (and dropped)
    // by the server before releasing the first login's blocked live_subscribe
    // — otherwise this is an in-process test and calling releaseSubscribe()
    // synchronously right after send() can resolve and finish the first login
    // via microtasks before the second AUTH's network frame is even delivered,
    // which would defeat the race this test exists to catch.
    buffered.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseSubscribe?.();

    await expect(initMessage).resolves.toMatchObject({ type: "INIT" });
    expect(prepareCallCount).toBe(1);
    expect(liveSubscribeCallCount).toBe(1);

    await closeSocket(buffered.socket);
  });
});
