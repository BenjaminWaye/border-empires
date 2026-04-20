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

client.SubscribePlayer({ player_id: process.env.PLAYER_ID ?? "player-1", subscription_json: "{}" }, (error, response) => {
  if (error) {
    console.error(error);
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
});
