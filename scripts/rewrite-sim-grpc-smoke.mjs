import { createSimulationClient } from "../apps/realtime-gateway/dist/apps/realtime-gateway/src/sim-client.js";

const simulationAddress = process.env.SIMULATION_ADDRESS ?? "127.0.0.1:50051";
const playerId = process.env.PLAYER_ID ?? "player-1";
const commandId = process.env.COMMAND_ID ?? `grpc-smoke-${Date.now()}`;
const command = {
  commandId,
  sessionId: process.env.SESSION_ID ?? "grpc-smoke",
  playerId,
  clientSeq: Number(process.env.CLIENT_SEQ ?? "999"),
  issuedAt: Date.now(),
  type: "ATTACK",
  payloadJson: JSON.stringify({
    fromX: Number(process.env.ATTACK_FROM_X ?? "4"),
    fromY: Number(process.env.ATTACK_FROM_Y ?? "0"),
    toX: Number(process.env.ATTACK_TO_X ?? "5"),
    toY: Number(process.env.ATTACK_TO_Y ?? "0")
  })
};

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "8000");
const client = createSimulationClient(simulationAddress);

const stop = client.streamEvents((event) => {
  if (event.playerId !== playerId) return;
  if (event.commandId !== commandId) return;
  console.log(JSON.stringify(event));
  if (event.eventType === "COMMAND_ACCEPTED" || event.eventType === "COMMAND_REJECTED") {
    clearTimeout(timeoutId);
    stop();
    process.exit(event.eventType === "COMMAND_ACCEPTED" ? 0 : 1);
  }
});

const timeoutId = setTimeout(() => {
  stop();
  console.error(JSON.stringify({ ok: false, reason: "timeout", commandId }));
  process.exit(2);
}, timeoutMs);

const snapshot = await client.subscribePlayer(playerId);
const tilesByKey = new Map(snapshot.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
console.log(
  JSON.stringify({
    type: "SNAPSHOT",
    playerId,
    totalTiles: snapshot.tiles.length,
    probes: [
      tilesByKey.get("4,0") ?? null,
      tilesByKey.get("5,0") ?? null,
      tilesByKey.get("4,4") ?? null,
      tilesByKey.get("5,4") ?? null
    ]
  })
);
await client.submitCommand(command);
