import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Server, ServerCredentials, type ServiceDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { SIMULATION_PROTO_PATH } from "@border-empires/sim-protocol";
import { createSimulationClient } from "./sim-client.js";

describe("full-map snapshot transport", () => {
  it("accepts an ended-season snapshot larger than the default 4 MiB gRPC receive limit", async () => {
    const definition = loadSync(fileURLToPath(SIMULATION_PROTO_PATH), { keepCase: true });
    const service = definition["border_empires.simulation.SimulationService"] as ServiceDefinition;
    const server = new Server();
    const name = "x".repeat(5 * 1024 * 1024);
    server.addService(service, {
      SubscribePlayer(_call, callback) {
        callback(null, {
          ok: true, player_id: "p1", tiles: [{ x: 0, y: 0, terrain: "LAND" }],
          season_json: JSON.stringify({ seasonId: "ended-season", status: "ended" }),
          player_json: JSON.stringify({ id: "p1", name })
        });
      }
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync("127.0.0.1:0", ServerCredentials.createInsecure(), (error, bound) => error ? reject(error) : resolve(bound));
    });
    try {
      const client = createSimulationClient(`127.0.0.1:${port}`);
      const snapshot = await client.subscribePlayer("p1", '{"mode":"bootstrap-only"}');
      expect(snapshot.player?.name).toHaveLength(name.length);
      expect(snapshot.season?.status).toBe("ended");
      expect(snapshot.tiles).toHaveLength(1);
    } finally { server.forceShutdown(); }
  });
});
