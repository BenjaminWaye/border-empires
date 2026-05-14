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
  SubscribePlayer?: (
    request: { player_id: string; subscription_json: string },
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

const subscribePlayer = async (client: RawSimulationClient, playerId: string): Promise<void> => {
  const rpc = client.SubscribePlayer;
  if (!rpc) throw new Error("SubscribePlayer RPC unavailable");
  await new Promise<void>((resolve, reject) => {
    rpc.call(client, { player_id: playerId, subscription_json: "{}" }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

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

type StreamedEvent = {
  event_type?: string;
  command_id?: string;
  player_id?: string;
  message_type?: string;
  payload_json?: string;
};

const waitForStreamEvent = async (
  client: RawSimulationClient,
  predicate: (event: StreamedEvent) => boolean,
  timeoutMs = 4_000
): Promise<StreamedEvent> => {
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

describe("simulation streams TILE_DELTA_BATCH per subscribed player with visibility filtering", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("emits a per-player TILE_DELTA_BATCH addressed to the actor when they have vision of their own tile flip", async () => {
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

    // Per-player visibility means the simulation only emits a TILE_DELTA_BATCH
    // for subscribed players whose visible-tile set includes the flipped tile.
    // Subscribe the actor so we can assert they receive their own flip.
    await subscribePlayer(client, actorId);

    const commandId = "actor-expand-self-visible";
    const tileFlipped = waitForStreamEvent(
      client,
      (event) => event.event_type === "TILE_DELTA_BATCH" && event.command_id === commandId && event.player_id === actorId
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

  it("emits an ATTACK_ALERT player message addressed to the defender so they see the incoming-attack overlay", async () => {
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

    // Look for two seeded players whose tiles are adjacent so we can drive a
    // real ATTACK between them. The attacker plays the role of an unsubscribed
    // AI; the defender plays the role of a subscribed human whose tile is
    // about to be hit. The runtime emits a PLAYER_MESSAGE addressed to the
    // defender — that's what the rewrite client renders as the under-attack
    // overlay.
    const exportedTiles = service.runtime.exportState().tiles;
    const tileByKey = new Map(exportedTiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const ownedNeighborOffsets: Array<{ dx: number; dy: number }> = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: -1, dy: 1 }
    ];
    let attackerId: string | undefined;
    let defenderId: string | undefined;
    let attackOrigin: (typeof exportedTiles)[number] | undefined;
    let attackTarget: (typeof exportedTiles)[number] | undefined;
    for (const tile of exportedTiles) {
      if (!tile.ownerId) continue;
      for (const { dx, dy } of ownedNeighborOffsets) {
        const neighbor = tileByKey.get(`${tile.x + dx},${tile.y + dy}`);
        if (
          neighbor &&
          neighbor.terrain === "LAND" &&
          neighbor.ownerId &&
          neighbor.ownerId !== tile.ownerId
        ) {
          attackerId = tile.ownerId;
          defenderId = neighbor.ownerId;
          attackOrigin = tile;
          attackTarget = neighbor;
          break;
        }
      }
      if (attackTarget) break;
    }
    expect(attackerId, "expected a seeded attacker with an enemy-owned neighbor").toBeDefined();
    expect(defenderId, "expected a seeded defender owning the chosen target tile").toBeDefined();
    expect(attackOrigin, "expected an owned origin tile for the attacker").toBeDefined();
    expect(attackTarget, "expected an enemy-owned target tile").toBeDefined();
    if (!attackerId || !defenderId || !attackOrigin || !attackTarget) return;

    // Subscribe only the defender — that's the production shape: human
    // defender's gateway is the only stream listener that should be alerted,
    // while the AI attacker remains unsubscribed.
    await subscribePlayer(client, defenderId);

    const commandId = "unsubscribed-attacker-attack-alert";
    const attackAlert = waitForStreamEvent(
      client,
      (event) =>
        (event.event_type === "PLAYER_MESSAGE" &&
          event.message_type === "ATTACK_ALERT" &&
          event.command_id === commandId) ||
        (event.event_type === "COMMAND_REJECTED" && event.command_id === commandId)
    );

    await submitCommand(client, {
      command_id: commandId,
      session_id: "session-unsub-attack-alert",
      player_id: attackerId,
      client_seq: 1,
      issued_at: Date.now(),
      type: "ATTACK",
      payload_json: JSON.stringify({
        fromX: attackOrigin.x,
        fromY: attackOrigin.y,
        toX: attackTarget.x,
        toY: attackTarget.y
      })
    });

    const event = await attackAlert;
    expect(event.event_type, `attack rejected: ${event.payload_json ?? ""}`).toBe("PLAYER_MESSAGE");
    expect(event.player_id).toBe(defenderId);
    expect(typeof event.payload_json).toBe("string");
    if (typeof event.payload_json !== "string") return;
    const payload = JSON.parse(event.payload_json) as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        type: "ATTACK_ALERT",
        attackerId,
        x: attackTarget.x,
        y: attackTarget.y,
        fromX: attackOrigin.x,
        fromY: attackOrigin.y
      })
    );
    expect(typeof payload.resolvesAt).toBe("number");
  });
});
