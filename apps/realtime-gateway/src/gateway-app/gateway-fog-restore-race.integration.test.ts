import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, firebaseJwtFor, openSocket, testFirebaseTokenVerifier, withTimeout } from "./rewrite-stack-test-helpers.js";

// Regression for bug report 1c8538f4 (staging 2026-11-20): a fog admin pressed
// "Restore fog" while a full-visibility live refresh was still in flight. The
// stale refresh resolved afterwards, flipped the session back to fogDisabled,
// re-sent the revealed map, and kept triggering full-world resubscribes that
// starved the simulation (SIMULATION_UNAVAILABLE on EXPAND).

type Snapshot = { playerId: string; tiles: Array<{ x: number; y: number }> };
const ADMIN_EMAIL = "fog-admin@example.com";
const revealedTiles = Array.from({ length: 5 }, (_, index) => ({ x: index, y: 0 }));
const foggedTiles = [{ x: 0, y: 0 }];

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("gateway fog restore race", () => {
  const cleanup: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("does not re-reveal the map when a live refresh resolves after fog was restored", async () => {
    let emit: ((event: SimulationClientEvent) => void) | undefined;
    const fullVisibilityCalls: Array<ReturnType<typeof deferred<Snapshot>>> = [];
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      adminEmail: ADMIN_EMAIL,
      firebaseTokenVerifier: testFirebaseTokenVerifier,
      fogLiveRefreshMinGapMs: 0,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async (playerId: string) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId: string, json?: string) => {
          const request = JSON.parse(json ?? "{}") as { fullVisibility?: boolean };
          if (request.fullVisibility !== true) return { playerId, tiles: foggedTiles };
          const call = deferred<Snapshot>();
          fullVisibilityCalls.push(call);
          return call.promise;
        },
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: (listener: (event: SimulationClientEvent) => void, options?: { onConnect?: () => void }) => {
          emit = listener;
          options?.onConnect?.();
          return () => undefined;
        }
      } as never
    });
    cleanup.push(() => app.close());
    const started = await app.start();

    const client = await openSocket(started.wsUrl);
    cleanup.push(() => closeSocket(client.socket));
    const received: Array<Record<string, unknown>> = [];
    client.socket.addEventListener("message", (event: { data: string }) => {
      received.push(JSON.parse(event.data) as Record<string, unknown>);
    });
    const waitFor = (label: string, predicate: (message: Record<string, unknown>) => boolean): Promise<void> =>
      withTimeout(label, (async () => {
        while (!received.some(predicate)) await new Promise((r) => setTimeout(r, 10));
      })());

    client.socket.send(JSON.stringify({
      type: "AUTH",
      token: await firebaseJwtFor({ sub: "fog-admin-1", user_id: "fog-admin-1", email: ADMIN_EMAIL, name: "Fog Admin" })
    }));
    await waitFor("init", (message) => message.type === "INIT");
    const playerId = String((received.find((message) => message.type === "INIT") as { player?: { id?: string } }).player?.id ?? "player-1");

    // Reveal the map.
    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: true }));
    await withTimeout("reveal subscribe", (async () => { while (fullVisibilityCalls.length < 1) await new Promise((r) => setTimeout(r, 10)); })());
    fullVisibilityCalls[0]!.resolve({ playerId, tiles: revealedTiles });
    await waitFor("fog disabled", (message) => message.type === "FOG_UPDATE" && message.fogDisabled === true);

    // A world change starts a slow full-visibility live refresh.
    emit?.({ eventType: "TILE_DELTA_BATCH", commandId: "world-change-1", playerId, tileDeltas: [{ x: 0, y: 0 }] } as SimulationClientEvent);
    await withTimeout("live refresh subscribe", (async () => { while (fullVisibilityCalls.length < 2) await new Promise((r) => setTimeout(r, 10)); })());

    // Restore fog while that refresh is still in flight.
    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor("fog restored", (message) => message.type === "FOG_UPDATE" && message.fogDisabled === false);
    const restoredAt = received.length;

    // The stale refresh resolves now.
    fullVisibilityCalls[1]!.resolve({ playerId, tiles: revealedTiles });
    await new Promise((r) => setTimeout(r, 150));
    // Another world change must not start a new full-world resubscribe.
    emit?.({ eventType: "TILE_DELTA_BATCH", commandId: "world-change-2", playerId, tileDeltas: [{ x: 0, y: 0 }] } as SimulationClientEvent);
    await new Promise((r) => setTimeout(r, 150));

    const afterRestore = received.slice(restoredAt);
    expect(afterRestore.filter((message) => message.type === "FOG_UPDATE")).toEqual([]);
    expect(
      afterRestore.filter((message) => message.type === "TILE_SNAPSHOT_REPLACE" && Array.isArray(message.tiles) && message.tiles.length === revealedTiles.length)
    ).toEqual([]);
    expect(fullVisibilityCalls).toHaveLength(2);
  });
});
