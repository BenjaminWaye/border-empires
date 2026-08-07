import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

import { createSimulationService } from "./simulation-service.js";

// Regression cover for the stale SubscribePlayer snapshot.
//
// The per-player snapshot cache is only maintained for players the tile-delta
// fanout considers subscribed. A world change that lands while a player is
// unsubscribed never reaches their cached snapshot, and buildInitMessage does
// no server-side tile replay — so serving that cache on the next subscribe
// left the client permanently missing those tiles. In the wild this showed up
// as a Light Outpost's vision disc never revealing: the outpost was built
// while the owner was disconnected, so the newly-visible tiles were absent
// from their INIT and nothing later re-touched them.
//
// This exercises the general invariant (a tile change made while unsubscribed
// must be visible on the next subscribe) rather than the outpost specifically,
// because the cache carries ownership, towns and structures too — the outpost
// disc was one symptom, not the scope of the bug.

// replaceTileState emits a visibility-audit warning on this path, so warn/debug
// must exist or the command dispatch throws mid-uncapture.
const silentLog = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  error: () => undefined
};

type SnapshotTile = {
  x: number;
  y: number;
  owner_id?: string;
  ownership_state?: string;
  town_population_tier?: string;
};

type RawSimulationClient = {
  SubmitCommand?: (
    request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string },
    callback: (error: Error | null, response: { ok: boolean }) => void
  ) => void;
  PreparePlayer?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean }) => void
  ) => void;
  SubscribePlayer?: (
    request: { player_id: string; subscription_json: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; tiles?: SnapshotTile[] }) => void
  ) => void;
  UnsubscribePlayer?: (request: { player_id: string }, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  FetchTileDetail?: (
    request: { player_id: string; x: number; y: number; full_visibility?: boolean },
    callback: (error: Error | null, response: { ok: boolean; tiles?: SnapshotTile[] }) => void
  ) => void;
};

const packageDefinition = loadSync(fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});

const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: {
    simulation: {
      SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawSimulationClient;
    };
  };
};

const createRawSimulationClient = (address: string) =>
  new proto.border_empires.simulation.SimulationService(address, credentials.createInsecure());

const callRpc = <TRequest, TResponse>(
  client: RawSimulationClient,
  rpc: ((request: TRequest, callback: (error: Error | null, response: TResponse) => void) => void) | undefined,
  name: string,
  request: TRequest
): Promise<TResponse> => {
  if (!rpc) throw new Error(`${name} RPC unavailable in integration test`);
  return new Promise<TResponse>((resolve, reject) => {
    rpc.call(client, request, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
};

const preparePlayer = (client: RawSimulationClient, playerId: string) =>
  callRpc(client, client.PreparePlayer, "PreparePlayer", { player_id: playerId });

const subscribePlayer = async (client: RawSimulationClient, playerId: string, subscriptionJson = "{}"): Promise<SnapshotTile[]> =>
  (await callRpc(client, client.SubscribePlayer, "SubscribePlayer", { player_id: playerId, subscription_json: subscriptionJson })).tiles ?? [];

const unsubscribePlayer = (client: RawSimulationClient, playerId: string) =>
  callRpc(client, client.UnsubscribePlayer, "UnsubscribePlayer", { player_id: playerId });

const submitCommand = (
  client: RawSimulationClient,
  request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string }
) => callRpc(client, client.SubmitCommand, "SubmitCommand", request);

const fetchTile = async (client: RawSimulationClient, playerId: string, x: number, y: number): Promise<SnapshotTile | undefined> => {
  const response = await callRpc(client, client.FetchTileDetail, "FetchTileDetail", { player_id: playerId, x, y, full_visibility: true });
  return (response.tiles ?? []).find((tile) => tile.x === x && tile.y === y);
};

// The command is applied asynchronously and, with the player unsubscribed, the
// simulation emits no stream events for them (events are gated on
// subscriptionRegistry.isSubscribed). FetchTileDetail reads the live runtime
// rather than the snapshot cache, so it is the one way to observe the applied
// change from outside while offline.
const waitForLiveTileChange = async (
  client: RawSimulationClient,
  playerId: string,
  x: number,
  y: number,
  timeoutMs = 5_000
): Promise<SnapshotTile | undefined> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const tile = await fetchTile(client, playerId, x, y);
    if (tile?.owner_id !== playerId) return tile;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${x},${y} to be released in the live runtime`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe("subscribe snapshot staleness", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("serves a rebuilt snapshot when the world changed while the player was unsubscribed", async () => {
    // "stress-10ai" seeds player-1 with a real territory rather than the single
    // settlement tile a fresh spawn gets — UNCAPTURE_TILE refuses a player's
    // last tile and their settlement, so a spawn has nothing releasable.
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      seedProfile: "stress-10ai",
      enableAiAutopilot: false,
      enableSystemAutopilot: false,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "player-1";

    // First login populates the cache.
    const firstLogin = await subscribePlayer(client, playerId);
    const releasable = firstLogin.find(
      (tile) => tile.owner_id === playerId && !tile.town_population_tier
    );
    expect(releasable, "seeded territory should own a tile with no town on it").toBeDefined();
    const { x, y } = releasable!;

    // Player disconnects.
    await unsubscribePlayer(client, playerId);

    // World moves on while they are offline. Nothing updates their cached
    // snapshot, and no delta is fanned out to them.
    await submitCommand(client, {
      command_id: "uncapture-while-unsubscribed",
      session_id: "session-1",
      player_id: playerId,
      client_seq: 1,
      issued_at: Date.now(),
      type: "UNCAPTURE_TILE",
      payload_json: JSON.stringify({ x, y })
    });
    const liveTile = await waitForLiveTileChange(client, playerId, x, y);
    expect(liveTile?.owner_id).not.toBe(playerId);

    // Next login must reflect the change. Before the revision stamp this
    // returned the cached snapshot from the first login, still showing the
    // tile as owned — and no later event would ever correct it.
    const secondLogin = await subscribePlayer(client, playerId);
    const reloaded = secondLogin.find((tile) => tile.x === x && tile.y === y);
    expect(reloaded?.owner_id).not.toBe(playerId);
  });

  it("still serves the cache for a bootstrap retry when the world has not moved", async () => {
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      enableAiAutopilot: false,
      enableSystemAutopilot: false,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "firebase-user-bootstrap-retry";

    await preparePlayer(client, playerId);
    const first = await subscribePlayer(client, playerId, JSON.stringify({ mode: "bootstrap-only" }));

    // The gateway's bootstrap loop fires several of these while the first build
    // is still running. With no intervening tile change the stamp still matches,
    // so the retry is a cache hit rather than another full build — the reason
    // the cache exists, which the staleness fix must not throw away.
    const retryStartedAt = Date.now();
    const retry = await subscribePlayer(client, playerId, JSON.stringify({ mode: "bootstrap-only" }));

    expect(retry.length).toBe(first.length);
    expect(Date.now() - retryStartedAt).toBeLessThan(1_000);
  });
});
