import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const soakScript = resolve(dirname(fileURLToPath(import.meta.url)), "rewrite-local-soak.mjs");

// Minimal fake gateway: one settled town tile for p1, every neighbour owned by
// an enemy, so the soak's only candidates are ATTACKs. ATTACK is rejected with
// INSUFFICIENT_MUSTER (attacks need a staged muster flag); EXPAND is accepted.
const startFakeGateway = () =>
  new Promise((resolveServer) => {
    const received = [];
    const server = new WebSocketServer({ port: 0 }, () => resolveServer({ server, received, port: server.address().port }));
    server.on("connection", (socket) => {
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString());
        received.push(message.type);
        if (message.type === "AUTH") {
          const tiles = [{ x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", townType: "TOWN" }];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            tiles.push({ x: 10 + dx, y: 10 + dy, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
          }
          socket.send(JSON.stringify({ type: "INIT", player: { id: "p1" }, initialState: { tiles }, recovery: { nextClientSeq: 1 } }));
          return;
        }
        if (message.type === "ATTACK") {
          socket.send(JSON.stringify({ type: "ERROR", commandId: message.commandId, code: "INSUFFICIENT_MUSTER", message: "need 15 mustered manpower to launch attack" }));
          return;
        }
        if (message.type === "EXPAND") {
          socket.send(JSON.stringify({ type: "COMMAND_QUEUED", commandId: message.commandId }));
          socket.send(JSON.stringify({ type: "ACTION_ACCEPTED", commandId: message.commandId }));
        }
      });
    });
  });

const runSoak = (port) =>
  new Promise((resolveRun) => {
    execFile(
      process.execPath,
      [soakScript],
      {
        env: {
          ...process.env,
          WS_URL: `ws://127.0.0.1:${port}`,
          AUTH_TOKEN: "p1",
          SOAK_ITERATIONS: "2",
          SOAK_WARMUP_ITERATIONS: "0",
          SOAK_TIMEOUT_MS: "5000",
          SOAK_ALLOW_ATTACKS: "1",
          SOAK_LOG_EACH_ITERATION: "0",
          SOAK_SETTLE_AFTER_ACCEPTED_MS: "0"
        },
        timeout: 30_000
      },
      (error, stdout, stderr) => resolveRun({ code: error ? (error.code ?? 1) : 0, stdout, stderr })
    );
  });

test("an attack rejected for lack of muster stops the soak gracefully instead of failing the gate", async () => {
  const { server, received, port } = await startFakeGateway();
  try {
    const { code, stdout, stderr } = await runSoak(port);
    assert.equal(code, 0, `soak exited ${code}: ${stderr}`);
    const summary = JSON.parse(stdout.trim().split("\n").filter((line) => line.startsWith("{")).at(-1));
    assert.equal(summary.ok, true);
    assert.ok(summary.diagnostics.musterBlockedAttacks >= 1, JSON.stringify(summary.diagnostics));
    assert.match(String(summary.stoppedReason), /found no frontier action candidate/);
    // Once muster-blocked, the session must not keep resending attacks.
    assert.ok(received.filter((type) => type === "ATTACK").length <= 2, received.join(","));
  } finally {
    server.close();
  }
});
