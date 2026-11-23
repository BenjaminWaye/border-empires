import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { closeSocket, firebaseJwtFor, openSocket, testFirebaseTokenVerifier, withTimeout } from "./rewrite-stack-test-helpers.js";

// A revealed fog admin must never cost the simulation another full-world
// snapshot after the reveal itself. The gateway used to re-request the whole
// world on every change in the admin's view (bug report 1c8538f4, staging
// 2026-11-20; measured in docs/load-results/full-reveal-2026-11-23.md): one
// revealed player stalled the simulation and the gateway for everyone. The
// map now stays current through unfiltered live deltas ("spectating").

type Snapshot = { playerId: string; tiles: Array<{ x: number; y: number }> };
const ADMIN_EMAIL = "fog-admin@example.com";
const revealedTiles = Array.from({ length: 5 }, (_, index) => ({ x: index, y: 0 }));
const foggedTiles = [{ x: 0, y: 0 }];

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("gateway revealed-map live updates", () => {
  const cleanup: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  const startRevealedAdmin = async (options: { failRestore?: boolean } = {}) => {
    let emit: ((event: SimulationClientEvent) => void) | undefined;
    const fullVisibilityCalls: Array<ReturnType<typeof deferred<Snapshot>>> = [];
    const spectateCalls: boolean[] = [];
    const app = await createRealtimeGatewayApp({
      logger: false,
      port: 0,
      defaultHumanPlayerId: "player-1",
      adminEmail: ADMIN_EMAIL,
      firebaseTokenVerifier: testFirebaseTokenVerifier,
      commandStore: new InMemoryGatewayCommandStore(),
      simulationClient: {
        preparePlayer: async (playerId: string) => ({ playerId, spawned: false }),
        submitCommand: async () => undefined,
        subscribePlayer: async (playerId: string, json?: string) => {
          const request = JSON.parse(json ?? "{}") as { fullVisibility?: boolean; trigger?: string; spectate?: boolean; spectateOnly?: boolean };
          if (request.spectateOnly === true) {
            spectateCalls.push(request.spectate === true);
            return { playerId, tiles: [] };
          }
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
    return { client, received, fullVisibilityCalls, spectateCalls, playerId, poll, waitFor, worldChange };
  };

  it("delivers a world change to a revealed admin as a delta, without another full-world snapshot", async () => {
    const { received, fullVisibilityCalls, waitFor, worldChange } = await startRevealedAdmin();

    worldChange("world-change-1");
    await waitFor("live delta", (message) => message.type === "TILE_DELTA_BATCH" && message.commandId === "world-change-1");
    worldChange("world-change-2");
    await waitFor("second live delta", (message) => message.type === "TILE_DELTA_BATCH" && message.commandId === "world-change-2");
    await new Promise((r) => setTimeout(r, 150));

    // Only the reveal itself asked the simulation for the whole world.
    expect(fullVisibilityCalls).toHaveLength(1);
    expect(received.filter((message) => message.type === "TILE_SNAPSHOT_REPLACE")).toHaveLength(1);
  });

  it("stays fogged after a restore: later world changes arrive as deltas only", async () => {
    const { client, received, fullVisibilityCalls, waitFor, worldChange } = await startRevealedAdmin();

    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor("fog restored", (message) => message.type === "FOG_UPDATE" && message.fogDisabled === false);
    const restoredAt = received.length;

    worldChange("world-change-after-restore");
    await waitFor("delta after restore", (message) => message.type === "TILE_DELTA_BATCH" && message.commandId === "world-change-after-restore");
    await new Promise((r) => setTimeout(r, 150));

    const afterRestore = received.slice(restoredAt);
    expect(afterRestore.filter((message) => message.type === "FOG_UPDATE")).toEqual([]);
    expect(afterRestore.filter((message) => message.type === "TILE_SNAPSHOT_REPLACE")).toEqual([]);
    expect(fullVisibilityCalls).toHaveLength(1);
  });

  it("keeps the map revealed and spectating when the restore snapshot fails", async () => {
    const { client, received, fullVisibilityCalls, spectateCalls, poll, waitFor, worldChange } = await startRevealedAdmin({ failRestore: true });

    client.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor("restore error", (message) => message.type === "ERROR" && message.code === "SIMULATION_UNAVAILABLE");
    // The client never got FOG_UPDATE false, so it still shows the revealed
    // map. The failed restore already told the simulation to stop spectating,
    // so the gateway must turn it back on or the revealed map goes stale.
    expect(received.some((message) => message.type === "FOG_UPDATE" && message.fogDisabled === false)).toBe(false);
    await poll("spectating re-asserted", () => spectateCalls.at(-1) === true);

    worldChange("world-change-after-failed-restore");
    await waitFor("delta after failed restore", (message) => message.type === "TILE_DELTA_BATCH" && message.commandId === "world-change-after-failed-restore");
    expect(fullVisibilityCalls).toHaveLength(1);
  });
});
