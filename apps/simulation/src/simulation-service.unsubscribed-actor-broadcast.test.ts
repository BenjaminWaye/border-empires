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
    request: {
      command_id: string;
      session_id: string;
      player_id: string;
      client_seq: number;
      issued_at: number;
      type: string;
      payload_json: string;
    },
    callback: (error: Error | null, response: { ok: boolean }) => void
  ) => void;
  StreamEvents?: (
    request: { at: number }
  ) => { on: (event: "data" | "error", handler: (value: any) => void) => void; cancel: () => void };
};

const packageDefinition = loadSync(fileURLToPath(new URL("../../../packages/sim-protocol/src/simulation.proto", import.meta.url)), {
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

const submitCommand = async (
  client: RawSimulationClient,
  request: {
    command_id: string;
    session_id: string;
    player_id: string;
    client_seq: number;
    issued_at: number;
    type: string;
    payload_json: string;
  }
): Promise<void> => {
  const rpc = client.SubmitCommand;
  if (!rpc) throw new Error("SubmitCommand RPC unavailable");
  await new Promise<void>((resolve, reject) => {
    rpc.call(client, request, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

const waitForStreamEvent = async (
  client: RawSimulationClient,
  predicate: (event: { event_type?: string; command_id?: string; player_id?: string }) => boolean,
  timeoutMs = 4_000
): Promise<{ event_type?: string; command_id?: string; player_id?: string }> => {
  const rpc = client.StreamEvents;
  if (!rpc) throw new Error("StreamEvents RPC unavailable");
  const stream = rpc.call(client, { at: Date.now() });
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      stream.cancel();
      reject(new Error("timed out waiting for simulation stream event"));
    }, timeoutMs);
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

describe("simulation streams TILE_DELTA_BATCH from unsubscribed actors", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("forwards TILE_DELTA_BATCH events caused by an unsubscribed actor so observers see live tile flips", async () => {
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

    // The default seed pre-populates a couple of AI-style players (player-1,
    // player-2). Pick whichever has an unowned land neighbor so we can drive
    // a successful EXPAND from a never-subscribed playerId — exactly the
    // production setup that triggered the desync the gateway was missing.
    const exportedTiles = service.runtime.exportState().tiles;
    const tileByKey = new Map(exportedTiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const ownedTilesByPlayer = new Map<string, typeof exportedTiles>();
    for (const tile of exportedTiles) {
      if (!tile.ownerId) continue;
      const list = ownedTilesByPlayer.get(tile.ownerId) ?? [];
      list.push(tile);
      ownedTilesByPlayer.set(tile.ownerId, list);
    }

    let actorId: string | undefined;
    let ownedOrigin: (typeof exportedTiles)[number] | undefined;
    let expandTarget: (typeof exportedTiles)[number] | undefined;
    for (const [candidateId, candidateOwnedTiles] of ownedTilesByPlayer) {
      for (const owned of candidateOwnedTiles) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const neighbor = tileByKey.get(`${owned.x + dx},${owned.y + dy}`);
            if (neighbor && neighbor.terrain === "LAND" && !neighbor.ownerId) {
              actorId = candidateId;
              ownedOrigin = owned;
              expandTarget = neighbor;
              break;
            }
          }
          if (expandTarget) break;
        }
        if (expandTarget) break;
      }
      if (expandTarget) break;
    }
    expect(actorId, "expected a seeded player with an unowned LAND neighbor").toBeDefined();
    expect(ownedOrigin, "expected an owned origin tile for the chosen actor").toBeDefined();
    expect(expandTarget, "expected an unowned LAND target adjacent to the actor's tile").toBeDefined();
    if (!actorId || !ownedOrigin || !expandTarget) return;

    const commandId = "unsubscribed-actor-expand";
    const tileFlipped = waitForStreamEvent(
      client,
      (event) => event.event_type === "TILE_DELTA_BATCH" && event.command_id === commandId
    );

    await submitCommand(client, {
      command_id: commandId,
      session_id: "session-unsub-broadcast",
      player_id: actorId,
      client_seq: 1,
      issued_at: Date.now(),
      type: "EXPAND",
      payload_json: JSON.stringify({
        fromX: ownedOrigin.x,
        fromY: ownedOrigin.y,
        toX: expandTarget.x,
        toY: expandTarget.y
      })
    });

    await expect(tileFlipped).resolves.toEqual(
      expect.objectContaining({
        event_type: "TILE_DELTA_BATCH",
        command_id: commandId,
        player_id: actorId
      })
    );
  });
});
