import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { forEachExploredTile, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import { createSimulationService } from "./simulation-service.js";

// Regression: explored land turned back into unexplored storm after a
// restart/reconnect because fog memory only lived in the browser. Every
// SubscribePlayer reply now carries the player's server-held explored tiles
// in player_json -- including replies served from the snapshot cache, which
// is why the second subscribe below matters.

const silentLog = { info: () => undefined, warn: () => undefined, debug: () => undefined, error: () => undefined };

type SubscribeAck = { ok: boolean; player_json?: string; tiles?: Array<{ x: number; y: number; owner_id?: string }> };
type RawSimulationClient = {
  SubscribePlayer?: (request: { player_id: string; subscription_json: string }, callback: (error: Error | null, response: SubscribeAck) => void) => void;
};

const packageDefinition = loadSync(fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});
const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: { simulation: { SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawSimulationClient } };
};

const subscribe = (client: RawSimulationClient, playerId: string): Promise<SubscribeAck> =>
  new Promise((resolve, reject) => {
    client.SubscribePlayer!.call(client, { player_id: playerId, subscription_json: "{}" }, (error, response) => (error ? reject(error) : resolve(response)));
  });

const exploredKeys = (ack: SubscribeAck): Set<string> => {
  const player = JSON.parse(ack.player_json ?? "{}") as { exploredTiles?: unknown };
  const keys = new Set<string>();
  forEachExploredTile(player.exploredTiles, WORLD_WIDTH, WORLD_HEIGHT, (x, y) => keys.add(`${x},${y}`));
  return keys;
};

describe("SubscribePlayer explored tiles", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("sends the player's explored tiles on every subscribe, including cached replies", async () => {
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
    const client = new proto.border_empires.simulation.SimulationService(started.address, credentials.createInsecure());

    const first = await subscribe(client, "player-1");
    const owned = (first.tiles ?? []).filter((tile) => tile.owner_id === "player-1");
    expect(owned.length).toBeGreaterThan(0);
    const explored = exploredKeys(first);
    for (const tile of owned) expect(explored.has(`${tile.x},${tile.y}`)).toBe(true);

    const second = await subscribe(client, "player-1");
    expect(exploredKeys(second)).toEqual(explored);
  });
});
