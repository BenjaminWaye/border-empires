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

  const startRevealedAdmin = async (options: { failRestore?: boolean } = {}) => {
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
          const request = JSON.parse(json ?? "{}") as { fullVisibility?: boolean; trigger?: string };
          if (request.trigger === "gateway_fog_restore" && options.failRestore === true) throw new Error("subscribe timed out");
          if (request.fullVisibility !== true) return { playerId, tiles: foggedTiles };
          const call = deferred<Snapshot>();
          fullVisibilityCalls.push(call);
          return call.promise;
        },
        unsubscribePlayer: async () => undefined,
        getSubscriptionNamespace: async () => "1",
        ping: async () => undefined,
        streamEvents: (listener: (event: SimulationClientEvent) => void, opts?: { onConnect?: () => void }) => {
          emit = listener;
          opts?.onConnect?.();
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
    const poll = (label: string, ready: () => boolean): Promise<void> =>
      withTimeout(label, (async () => {
        while (!ready()) await new Promise((r) => setTimeout(r, 10));
      })());
    const waitFor = (label: string, predicate: (message: Record<string, unknown>) => boolean): Promise<void> =>
      poll(label, () => received.some(predicate));

    client.socket.send(JSON.stringify({
      type: "AUTH",
      token: await firebaseJwtFor({ sub: "fog-admin-1", user_id: "fog-admin-1", email: ADMIN_EMAIL, name: "Fog Admin" })
    }));
    await waitFor("init", (message) => message.type === "INIT");
    const playerId = String((received.find((message) => message.type === "INIT") as { player?: { id?: string } }).player?.id ?? "player-1");

    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: true }));
    await poll("reveal subscribe", () => fullVisibilityCalls.length >= 1);
    fullVisibilityCalls[0]!.resolve({ playerId, tiles: revealedTiles });
    await waitFor("fog disabled", (message) => message.type === "FOG_UPDATE" && message.fogDisabled === true);
    const worldChange = (commandId: string): void =>
      emit?.({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [{ x: 0, y: 0 }] } as SimulationClientEvent);
    return { client, received, fullVisibilityCalls, playerId, poll, waitFor, worldChange };
  };

  it("does not re-reveal the map when a live refresh resolves after fog was restored", async () => {
    const { client, received, fullVisibilityCalls, playerId, poll, waitFor, worldChange } = await startRevealedAdmin();

    // A world change starts a slow full-visibility live refresh.
    worldChange("world-change-1");
    await poll("live refresh subscribe", () => fullVisibilityCalls.length >= 2);

    // Restore fog while that refresh is still in flight.
    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor("fog restored", (message) => message.type === "FOG_UPDATE" && message.fogDisabled === false);
    const restoredAt = received.length;

    // The stale refresh resolves now.
    fullVisibilityCalls[1]!.resolve({ playerId, tiles: revealedTiles });
    await new Promise((r) => setTimeout(r, 150));
    // Another world change must not start a new full-world resubscribe.
    worldChange("world-change-2");
    await new Promise((r) => setTimeout(r, 150));

    const afterRestore = received.slice(restoredAt);
    expect(afterRestore.filter((message) => message.type === "FOG_UPDATE")).toEqual([]);
    expect(
      afterRestore.filter((message) => message.type === "TILE_SNAPSHOT_REPLACE" && Array.isArray(message.tiles) && message.tiles.length === revealedTiles.length)
    ).toEqual([]);
    expect(fullVisibilityCalls).toHaveLength(2);
  });

  it("keeps the map revealed and in sync when the restore snapshot fails", async () => {
    const { client, received, fullVisibilityCalls, playerId, poll, waitFor, worldChange } = await startRevealedAdmin({ failRestore: true });

    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor("restore error", (message) => message.type === "ERROR" && message.code === "SIMULATION_UNAVAILABLE");
    // The client never got FOG_UPDATE false, so it still shows the revealed map. The
    // server must agree: a world change refreshes the full-world view (not a
    // fogged delta merged into the stale revealed snapshot).
    expect(received.some((message) => message.type === "FOG_UPDATE" && message.fogDisabled === false)).toBe(false);
    worldChange("world-change-after-failed-restore");
    await poll("full-visibility refresh after failed restore", () => fullVisibilityCalls.length >= 2);
    fullVisibilityCalls[1]!.resolve({ playerId, tiles: revealedTiles });
    expect(received.some((message) => message.type === "TILE_DELTA_BATCH")).toBe(false);
  });
});
