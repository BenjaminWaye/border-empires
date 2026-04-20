import { fileURLToPath } from "node:url";

import { credentials, loadPackageDefinition } from "../apps/realtime-gateway/node_modules/@grpc/grpc-js/build/src/index.js";
import { loadSync } from "../apps/realtime-gateway/node_modules/@grpc/proto-loader/build/src/index.js";
import { SIMULATION_PROTO_PATH } from "../packages/sim-protocol/src/index.js";

const packageDefinition = loadSync(fileURLToPath(SIMULATION_PROTO_PATH), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});

const proto = loadPackageDefinition(packageDefinition);
const client = new proto.border_empires.simulation.SimulationService(
  process.env.SIMULATION_ADDRESS ?? "127.0.0.1:50051",
  credentials.createInsecure()
);

const stream = client.StreamEvents({ at: Date.now() });
const ignoreBootstrap = process.env.IGNORE_BOOTSTRAP === "1";
const timeoutId = setTimeout(() => {
  console.error("timeout");
  stream.cancel();
  process.exit(2);
}, 8000);

stream.on("data", (event) => {
  if (ignoreBootstrap && typeof event.command_id === "string" && event.command_id.startsWith("bootstrap:")) {
    return;
  }
  console.log(JSON.stringify(event, null, 2));
  clearTimeout(timeoutId);
  stream.cancel();
  process.exit(0);
});

stream.on("error", (error) => {
  clearTimeout(timeoutId);
  console.error(error);
  process.exit(1);
});

stream.on("end", () => {
  clearTimeout(timeoutId);
  console.error("stream ended");
  process.exit(1);
});

client.SubscribePlayer({ player_id: process.env.PLAYER_ID ?? "player-1", subscription_json: "{}" }, () => undefined);
