import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";


import { createSimulationService } from "./simulation-service.js";

const silentLog = {
  info: () => undefined,
  error: () => undefined
};

type RawSimulationClient = {
  SubmitCommand?: (
    request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string },
    callback: (error: Error | null, response: { ok: boolean }) => void
  ) => void;
  submitCommand?: (
    request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string },
    callback: (error: Error | null, response: { ok: boolean }) => void
  ) => void;
  PreparePlayer?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean }) => void
  ) => void;
  preparePlayer?: (
    request: { player_id: string },
    callback: (error: Error | null, response: { ok: boolean; player_id?: string; spawned?: boolean }) => void
  ) => void;
  SubscribePlayer?: (
    request: { player_id: string; subscription_json: string },
    callback: (
      error: Error | null,
      response: {
        ok: boolean;
        player_id?: string;
        world_status_json?: string;
        tiles?: Array<{ x: number; y: number; terrain?: string; owner_id?: string; ownership_state?: string }>;
      }
    ) => void
  ) => void;
  subscribePlayer?: (
    request: { player_id: string; subscription_json: string },
    callback: (
      error: Error | null,
      response: {
        ok: boolean;
        player_id?: string;
        world_status_json?: string;
        tiles?: Array<{ x: number; y: number; terrain?: string; owner_id?: string; ownership_state?: string }>;
      }
    ) => void
  ) => void;
  UnsubscribePlayer?: (request: { player_id: string }, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  unsubscribePlayer?: (request: { player_id: string }, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  StreamEvents?: (request: { at: number }) => { on: (event: "data" | "error", handler: (value: any) => void) => void; cancel: () => void };
  streamEvents?: (request: { at: number }) => { on: (event: "data" | "error", handler: (value: any) => void) => void; cancel: () => void };
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

const preparePlayer = async (client: RawSimulationClient, playerId: string): Promise<{ playerId: string; spawned: boolean }> => {
  const rpc = client.PreparePlayer ?? client.preparePlayer;
  if (!rpc) throw new Error("PreparePlayer RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { player_id: playerId }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId: response.player_id ?? playerId,
        spawned: response.spawned === true
      });
    });
  });
};

const subscribePlayer = async (
  client: RawSimulationClient,
  playerId: string,
  subscriptionJson = "{}"
): Promise<{ playerId: string; tiles: Array<{ x: number; y: number; terrain?: string; ownerId?: string; ownershipState?: string }>; worldStatus?: { leaderboard: { overall: unknown[] } } }> => {
  const rpc = client.SubscribePlayer ?? client.subscribePlayer;
  if (!rpc) throw new Error("SubscribePlayer RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { player_id: playerId, subscription_json: subscriptionJson }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId: response.player_id ?? playerId,
        tiles: (response.tiles ?? []).map((tile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.owner_id ? { ownerId: tile.owner_id } : {}),
          ...(tile.ownership_state ? { ownershipState: tile.ownership_state } : {})
        })),
        ...(response.world_status_json ? { worldStatus: JSON.parse(response.world_status_json) as { leaderboard: { overall: unknown[] } } } : {})
      });
    });
  });
};

const unsubscribePlayer = async (client: RawSimulationClient, playerId: string): Promise<void> => {
  const rpc = client.UnsubscribePlayer ?? client.unsubscribePlayer;
  if (!rpc) throw new Error("UnsubscribePlayer RPC unavailable in integration test");
  await new Promise<void>((resolve, reject) => {
    rpc.call(client, { player_id: playerId }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const submitCommand = async (
  client: RawSimulationClient,
  request: { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string }
): Promise<void> => {
  const rpc = client.SubmitCommand ?? client.submitCommand;
  if (!rpc) throw new Error("SubmitCommand RPC unavailable in integration test");
  await new Promise<void>((resolve, reject) => {
    rpc.call(client, request, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const waitForStreamEvent = async (
  client: RawSimulationClient,
  predicate: (event: { event_type?: string; command_id?: string }) => boolean
): Promise<{ event_type?: string; command_id?: string }> => {
  const rpc = client.StreamEvents ?? client.streamEvents;
  if (!rpc) throw new Error("StreamEvents RPC unavailable in integration test");
  const stream = rpc.call(client, { at: Date.now() });
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      stream.cancel();
      reject(new Error("timed out waiting for simulation stream event"));
    }, 2_000);
    stream.on("data", (event) => {
      if (!predicate(event)) return;
      settled = true;
      clearTimeout(timeout);
      stream.cancel();
      resolve(event);
    });
    stream.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
};

const expectNoMatchingStreamEvent = async (
  client: RawSimulationClient,
  predicate: (event: { event_type?: string; command_id?: string }) => boolean,
  timeoutMs = 250
): Promise<void> => {
  const rpc = client.StreamEvents ?? client.streamEvents;
  if (!rpc) throw new Error("StreamEvents RPC unavailable in integration test");
  const stream = rpc.call(client, { at: Date.now() });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.cancel();
      resolve();
    }, timeoutMs);
    stream.on("data", (event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      stream.cancel();
      reject(new Error(`unexpected simulation stream event ${event.event_type ?? "unknown"}`));
    });
    stream.on("error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
};

describe("prepare player integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("spawns an unknown player exactly once across repeated prepare calls", async () => {
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "firebase-user-1";

    await expect(preparePlayer(client, playerId)).resolves.toEqual({
      playerId,
      spawned: true
    });
    await expect(preparePlayer(client, playerId)).resolves.toEqual({
      playerId,
      spawned: false
    });

    const ownedTiles = service.runtime.exportState().tiles.filter((tile) => tile.ownerId === playerId);
    expect(ownedTiles).toHaveLength(1);
    expect(ownedTiles[0]?.ownershipState).toBe("SETTLED");
  });

  it("does not implicitly spawn unknown players during subscribe", async () => {
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "firebase-user-2";

    await expect(subscribePlayer(client, playerId)).resolves.toEqual(
      expect.objectContaining({
        playerId,
        tiles: []
      })
    );

    expect(service.runtime.exportState().tiles.filter((tile) => tile.ownerId === playerId)).toHaveLength(0);
  });

  it("returns a spawned player's initial snapshot after prepare then subscribe", async () => {
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "firebase-user-3";

    await preparePlayer(client, playerId);
    const snapshot = await subscribePlayer(client, playerId);

    expect(snapshot.playerId).toBe(playerId);
    expect(snapshot.tiles.some((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED")).toBe(true);
  });

  it("supports bootstrap-only subscribe snapshots for auth-path initialization", async () => {
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "firebase-user-4";

    await preparePlayer(client, playerId);
    const snapshot = await subscribePlayer(client, playerId, JSON.stringify({ mode: "bootstrap-only" }));

    expect(snapshot.playerId).toBe(playerId);
    expect(snapshot.tiles.some((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED")).toBe(true);
    expect(snapshot.worldStatus?.leaderboard.overall.length).toBeGreaterThan(0);
  });

  it("does not treat bootstrap-only subscribe as a live event subscription", async () => {
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
    const playerId = "firebase-user-bootstrap-only";

    await preparePlayer(client, playerId);
    await subscribePlayer(client, playerId, JSON.stringify({ mode: "bootstrap-only", emitBootstrapEvent: false }));
    await submitCommand(client, {
      command_id: "bootstrap-only-no-live-events",
      session_id: "session-1",
      player_id: playerId,
      client_seq: 1,
      issued_at: Date.now(),
      type: "EXPAND",
      payload_json: JSON.stringify({ fromX: 9999, fromY: 9999, toX: 10_000, toY: 10_000 })
    });

    await expectNoMatchingStreamEvent(
      client,
      (event) => event.command_id === "bootstrap-only-no-live-events"
    );
  });

  it("keeps forwarding player events after one of two subscriptions unsubscribes", async () => {
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
    const playerId = "firebase-user-5";

    await preparePlayer(client, playerId);
    await subscribePlayer(client, playerId);
    await subscribePlayer(client, playerId);
    await unsubscribePlayer(client, playerId);

    const rejectedEvent = waitForStreamEvent(
      client,
      (event) => event.event_type === "COMMAND_REJECTED" && event.command_id === "expand-after-single-unsubscribe"
    );

    await submitCommand(client, {
      command_id: "expand-after-single-unsubscribe",
      session_id: "session-1",
      player_id: playerId,
      client_seq: 1,
      issued_at: Date.now(),
      type: "EXPAND",
      payload_json: JSON.stringify({ fromX: 9999, fromY: 9999, toX: 10_000, toY: 10_000 })
    });

    await expect(rejectedEvent).resolves.toEqual(
      expect.objectContaining({
        event_type: "COMMAND_REJECTED",
        command_id: "expand-after-single-unsubscribe"
      })
    );
  });

  it("reveal-map (bootstrap-only + fullVisibility) is not served from a player's fog-limited cache", async () => {
    // "stress-10ai" seeds player-1 at x:0-4,y:0-9 and ai-5 at x:101-120,y:0-9 —
    // far outside VISION_RADIUS (4), so ai-5's tiles are a reliable stand-in for
    // "tiles the admin has never seen" without depending on random spawn placement.
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
    const observerId = "player-1";
    const farAwayId = "ai-5";

    // Ordinary login populates snapshotCacheByPlayerId with a fog-limited snapshot,
    // mirroring the gateway's gateway_auth_bootstrap subscribe.
    const fogLimited = await subscribePlayer(client, observerId);
    expect(fogLimited.tiles.some((tile) => tile.ownerId === farAwayId)).toBe(false);

    // Admin reveal-map requests a fresh full-visibility snapshot via bootstrap-only
    // mode. It must NOT be served from the fog-limited cache populated above, and
    // must include tiles well outside the observer's fog-of-war vision.
    const revealed = await subscribePlayer(
      client,
      observerId,
      JSON.stringify({ mode: "bootstrap-only", fullVisibility: true, trigger: "gateway_reveal_map" })
    );

    expect(revealed.tiles.some((tile) => tile.ownerId === farAwayId)).toBe(true);
  });

  it("still serves bootstrap-only cache hits for non-full-visibility retries", async () => {
    const service = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);
    const playerId = "firebase-user-bootstrap-cache-hit";

    await preparePlayer(client, playerId);
    const first = await subscribePlayer(client, playerId, JSON.stringify({ mode: "bootstrap-only" }));

    const retryStartedAt = Date.now();
    const retry = await subscribePlayer(client, playerId, JSON.stringify({ mode: "bootstrap-only" }));
    const retryDurationMs = Date.now() - retryStartedAt;

    expect(retry.tiles.length).toBe(first.tiles.length);
    // A cache hit should be near-instant; a rebuild would take much longer for a
    // full-world export. This guards the login/rally-anchor bootstrap-retry
    // optimization the reveal-map fix must not regress.
    expect(retryDurationMs).toBeLessThan(1_000);
  });
});
