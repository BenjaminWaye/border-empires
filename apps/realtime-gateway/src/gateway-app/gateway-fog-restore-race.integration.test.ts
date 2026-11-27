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
// map now stays current through the simulation's tagged unfiltered
// ("spectator") deltas, which only revealed sockets may receive.

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

  type Client = { socket: { send(data: string): void }; received: Array<Record<string, unknown>> };

  // One admin account on two connections: `revealed` reveals the map,
  // `fogged` (another device) does not.
  const startAdmin = async (options: { failRestore?: boolean; failReveal?: boolean } = {}) => {
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
          if (request.trigger === "gateway_reveal_map" && options.failReveal === true) throw new Error("subscribe timed out");
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

    const poll = (label: string, ready: () => boolean): Promise<void> =>
      withTimeout(label, (async () => {
        while (!ready()) await new Promise((r) => setTimeout(r, 10));
      })());
    const connect = async (): Promise<Client & { playerId: string }> => {
      const client = await openSocket(started.wsUrl);
      cleanup.push(() => closeSocket(client.socket));
      const received: Array<Record<string, unknown>> = [];
      client.socket.addEventListener("message", (event: { data: string }) => {
        received.push(JSON.parse(event.data) as Record<string, unknown>);
      });
      client.socket.send(JSON.stringify({
        type: "AUTH",
        token: await firebaseJwtFor({ sub: "fog-admin-1", user_id: "fog-admin-1", email: ADMIN_EMAIL, name: "Fog Admin" })
      }));
      await poll("init", () => received.some((message) => message.type === "INIT"));
      const playerId = String((received.find((message) => message.type === "INIT") as { player?: { id?: string } }).player?.id ?? "player-1");
      return { socket: client.socket, received, playerId };
    };
    const revealed = await connect();
    const fogged = await connect();
    const playerId = revealed.playerId;
    const waitFor = (client: Client, label: string, predicate: (message: Record<string, unknown>) => boolean): Promise<void> =>
      poll(label, () => client.received.some(predicate));
    const deltasFor = (client: Client, commandId: string) =>
      client.received.filter((message) => message.type === "TILE_DELTA_BATCH" && message.commandId === commandId);
    // The simulation sends each batch twice for a spectating player: the
    // ordinary fog-filtered copy, then the tagged unfiltered one.
    const worldChange = (commandId: string): void => {
      emit?.({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [{ x: 0, y: 0 }] } as SimulationClientEvent);
      emit?.({ eventType: "TILE_DELTA_BATCH", commandId: `${commandId}:spectator`, playerId, tileDeltas: [{ x: 0, y: 0 }, { x: 4, y: 0 }], spectator: true } as SimulationClientEvent);
    };
    const reveal = async (): Promise<void> => {
      revealed.socket.send(JSON.stringify({ type: "REQUEST_REVEAL_MAP" }));
      if (options.failReveal === true) return;
      await poll("reveal export", () => fullVisibilityCalls.length >= 1);
      fullVisibilityCalls[0]!.resolve({ playerId, tiles: revealedTiles });
      await waitFor(revealed, "reveal end", (message) => message.type === "REVEAL_MAP_END");
    };
    const settle = () => new Promise((r) => setTimeout(r, 150));
    return { revealed, fogged, fullVisibilityCalls, spectateCalls, poll, waitFor, deltasFor, worldChange, reveal, settle };
  };

  it("keeps a revealed socket current through spectator deltas, without another full-world snapshot", async () => {
    const { revealed, fullVisibilityCalls, spectateCalls, deltasFor, worldChange, reveal, settle } = await startAdmin();
    await reveal();
    expect(spectateCalls).toEqual([true]);

    worldChange("world-change-1");
    worldChange("world-change-2");
    await settle();

    expect(deltasFor(revealed, "world-change-1:spectator")).toHaveLength(1);
    expect(deltasFor(revealed, "world-change-2:spectator")).toHaveLength(1);
    // Only the reveal itself asked the simulation for the whole world.
    expect(fullVisibilityCalls).toHaveLength(1);
    expect(revealed.received.filter((message) => message.type === "TILE_SNAPSHOT_REPLACE")).toEqual([]);
  });

  // Review of #2932: spectating is per account, so the unfiltered copy reached
  // the account's fogged connections and the gateway's fogged snapshot cache.
  it("sends the unfiltered copy only to revealed sockets, and the fogged copy only to fogged ones", async () => {
    const { revealed, fogged, deltasFor, worldChange, reveal, settle } = await startAdmin();
    await reveal();

    worldChange("world-change");
    await settle();

    expect(deltasFor(revealed, "world-change")).toEqual([]);
    expect(deltasFor(revealed, "world-change:spectator")).toHaveLength(1);
    expect(deltasFor(fogged, "world-change")).toHaveLength(1);
    expect(deltasFor(fogged, "world-change:spectator")).toEqual([]);
  });

  it("puts every socket back on fogged deltas after a restore, without another full-world snapshot", async () => {
    const { revealed, fullVisibilityCalls, spectateCalls, waitFor, deltasFor, worldChange, reveal, settle } = await startAdmin();
    await reveal();

    revealed.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor(revealed, "fog restored", (message) => message.type === "FOG_UPDATE" && message.fogDisabled === false);
    worldChange("after-restore");
    await settle();

    expect(deltasFor(revealed, "after-restore")).toHaveLength(1);
    expect(deltasFor(revealed, "after-restore:spectator")).toEqual([]);
    expect(fullVisibilityCalls).toHaveLength(1);
    expect(spectateCalls).toEqual([true]); // the restore subscribe itself carries spectate: false
  });

  it("keeps the map revealed and spectating when the restore snapshot fails", async () => {
    const { revealed, spectateCalls, poll, waitFor, deltasFor, worldChange, reveal, settle } = await startAdmin({ failRestore: true });
    await reveal();

    revealed.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: false }));
    await waitFor(revealed, "restore error", (message) => message.type === "ERROR" && message.code === "SIMULATION_UNAVAILABLE");
    // The client never got FOG_UPDATE false, so it still shows the revealed
    // map; the failed restore already told the simulation to stop spectating.
    expect(revealed.received.some((message) => message.type === "FOG_UPDATE" && message.fogDisabled === false)).toBe(false);
    await poll("spectating re-asserted", () => spectateCalls.at(-1) === true && spectateCalls.length === 2);

    worldChange("after-failed-restore");
    await settle();
    expect(deltasFor(revealed, "after-failed-restore:spectator")).toHaveLength(1);
    expect(deltasFor(revealed, "after-failed-restore")).toEqual([]);
  });

  // Review of #2932: a failed reveal left the socket flagged revealed, so it
  // kept receiving unfiltered deltas onto a fogged map.
  it("returns a socket to its fogged view when the reveal export fails", async () => {
    const { revealed, spectateCalls, poll, waitFor, deltasFor, worldChange, reveal, settle } = await startAdmin({ failReveal: true });
    await reveal();

    await waitFor(revealed, "reveal error", (message) => message.type === "ERROR" && message.code === "REVEAL_MAP_UNAVAILABLE");
    await waitFor(revealed, "fogged view", (message) => message.type === "TILE_SNAPSHOT_REPLACE");
    await poll("spectating off", () => spectateCalls.at(-1) === false);

    worldChange("after-failed-reveal");
    await settle();
    expect(deltasFor(revealed, "after-failed-reveal")).toHaveLength(1);
    expect(deltasFor(revealed, "after-failed-reveal:spectator")).toEqual([]);
    expect(revealed.received.some((message) => message.type === "REVEAL_MAP_BEGIN")).toBe(false);
  });
});
