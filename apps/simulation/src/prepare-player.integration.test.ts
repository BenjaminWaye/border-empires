import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

import { SIMULATION_PROTO_PATH } from "@border-empires/sim-protocol";
import { createSimulationService } from "./simulation-service.js";

const silentLog = {
  info: () => undefined,
  error: () => undefined
};

type RawSimulationClient = {
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
      response: { ok: boolean; player_id?: string; tiles?: Array<{ x: number; y: number; owner_id?: string; ownership_state?: string }> }
    ) => void
  ) => void;
  subscribePlayer?: (
    request: { player_id: string; subscription_json: string },
    callback: (
      error: Error | null,
      response: { ok: boolean; player_id?: string; tiles?: Array<{ x: number; y: number; owner_id?: string; ownership_state?: string }> }
    ) => void
  ) => void;
};

const packageDefinition = loadSync(fileURLToPath(SIMULATION_PROTO_PATH), {
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
  playerId: string
): Promise<{ playerId: string; tiles: Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }> }> => {
  const rpc = client.SubscribePlayer ?? client.subscribePlayer;
  if (!rpc) throw new Error("SubscribePlayer RPC unavailable in integration test");
  return await new Promise((resolve, reject) => {
    rpc.call(client, { player_id: playerId, subscription_json: "{}" }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        playerId: response.player_id ?? playerId,
        tiles: (response.tiles ?? []).map((tile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.owner_id ? { ownerId: tile.owner_id } : {}),
          ...(tile.ownership_state ? { ownershipState: tile.ownership_state } : {})
        }))
      });
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
});
