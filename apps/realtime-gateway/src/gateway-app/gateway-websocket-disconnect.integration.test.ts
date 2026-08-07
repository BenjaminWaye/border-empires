import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { nextNonBootstrapMessage, openSocket, silentLog, waitUntil, withTimeout } from "./rewrite-stack-test-helpers.js";

// Regression coverage for player reports of frequent reconnects: the gateway
// must count every websocket close (metrics) and distinguish abnormal closes
// (anything other than 1000/1001) so ops can tell a flapping connection from
// normal tab-close/navigation churn without reproducing the report live.
describe("gateway websocket disconnect tracking", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  const startGateway = async (): Promise<{ address: string; wsUrl: string }> => {
    const simulation = await createSimulationService({ host: "127.0.0.1", port: 0, log: silentLog });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: new InMemoryGatewayCommandStore(),
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    return gateway.start();
  };

  it("counts a normal close (1000) without flagging it as abnormal", async () => {
    const gatewayAddress = await startGateway();
    const socket = await openSocket(gatewayAddress.wsUrl);
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "init")).type).toBe("INIT");

    const closed = withTimeout(
      "normal close",
      new Promise<void>((resolve) => {
        socket.socket.addEventListener("close", () => resolve(), { once: true });
      })
    );
    (socket.socket as unknown as { close: (code?: number, reason?: string) => void }).close(1000, "player navigated away");
    await closed;

    await waitUntil(async () => (await fetch(`${gatewayAddress.address}/metrics`).then((res) => res.text())).includes("gateway_websocket_disconnect_total 1"));
    const metricsBody = await fetch(`${gatewayAddress.address}/metrics`).then((res) => res.text());
    expect(metricsBody).toContain("gateway_websocket_disconnect_total 1");
    expect(metricsBody).toContain("gateway_websocket_abnormal_disconnect_total 0");
  }, 15_000);

  it("counts an abnormal close (missing close frame) separately from normal closes", async () => {
    const gatewayAddress = await startGateway();
    const socket = await openSocket(gatewayAddress.wsUrl);
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "init")).type).toBe("INIT");

    const closed = withTimeout(
      "abnormal close",
      new Promise<void>((resolve) => {
        socket.socket.addEventListener("close", () => resolve(), { once: true });
      })
    );
    // terminate() drops the TCP connection without a close handshake — the
    // closest a test can get to a real network drop / proxy idle timeout,
    // which the ws library surfaces to the server as an abnormal close.
    const raw = socket.socket as unknown as { terminate?: () => void; close: (code?: number, reason?: string) => void };
    if (raw.terminate) raw.terminate();
    else raw.close();
    await closed;

    await waitUntil(async () => (await fetch(`${gatewayAddress.address}/metrics`).then((res) => res.text())).includes("gateway_websocket_disconnect_total 1"));
    const metricsBody = await fetch(`${gatewayAddress.address}/metrics`).then((res) => res.text());
    expect(metricsBody).toContain("gateway_websocket_disconnect_total 1");
    if (raw.terminate) expect(metricsBody).toContain("gateway_websocket_abnormal_disconnect_total 1");
  }, 15_000);
});
