import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, nextNonBootstrapMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

// Regression coverage for the websocket keep-alive heartbeat: players were
// reporting frequent disconnects with close code 1005/1006 (no close frame
// at all) — the signature of an idle connection silently dropped by a
// proxy/network without either side being told.
//
// Raw ws-level ping/pong frames are invisible to application code by design
// (the same is true in a real browser), so this can't directly observe the
// gateway's ping — that mechanism itself is covered deterministically in
// websocket-heartbeat.test.ts against a fake socket. What this test verifies
// is the actual production wiring: a real connection through the full
// gateway survives many heartbeat cycles (with a very short interval) without
// being incorrectly terminated, proving registerSocket()/the connection
// handler are wired correctly end-to-end and a normal, responsive client is
// never penalized by the heartbeat.
describe("gateway websocket heartbeat wiring", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("keeps a normal, responsive connection alive across many heartbeat cycles", async () => {
    const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      defaultHumanPlayerId: "player-1",
      wsHeartbeatIntervalMs: 25
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "init")).type).toBe("INIT");

    // 25ms interval over 500ms is ~20 heartbeat ticks — comfortably enough to
    // catch a bug that terminates responsive sockets (e.g. an inverted
    // isAlive check) without relying on visibility into raw ping frames.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(socket.socket.readyState).not.toBe(socket.socket.CLOSED);
  }, 10_000);
});
