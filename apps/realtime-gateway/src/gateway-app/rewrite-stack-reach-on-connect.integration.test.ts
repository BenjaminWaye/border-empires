import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

/**
 * Regression guard for the authoritative reach border never reaching a
 * connecting client.
 *
 * The reach resend used to fire from PreparePlayer, which the gateway calls
 * before `playerSubscriptions.attachSocket`. The emitted REACH_UPDATE reached
 * the gateway with no socket registered for the player, so it was dropped with
 * only a `gateway_simulation_event_no_subscribers` warning. That is invisible
 * until the border changes while the player is offline — a reach anchor
 * finishing on the build timer — because the change-filtered flush records the
 * new border as "already emitted" on the way out and will never re-send it.
 * The connect-time push is the only delivery, and it was the one being lost.
 *
 * The push now happens on the live SubscribePlayer, the first handshake step
 * with the socket attached (live-subscribe-reach-push.ts). This test asserts
 * the message actually lands on the wire: it reads raw frames rather than
 * going through `nextNonBootstrapMessage`, which deliberately skips
 * REACH_UPDATE as ambient connect-time noise for every other test.
 */
describe("rewrite stack reach on connect", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("delivers the authoritative reach border to a socket as it connects", async () => {
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
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(`${gatewayAddress.wsUrl}?channel=control`);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));

    // Scan the connect stream for the reach push. Bounded so a genuine
    // regression fails on the read timeout rather than spinning.
    let reachUpdate: Record<string, unknown> | undefined;
    for (let frame = 0; frame < 40 && !reachUpdate; frame += 1) {
      const message = await socket.nextJsonMessage("connect stream");
      if (message.type === "REACH_UPDATE") reachUpdate = message;
    }

    expect(reachUpdate).toBeDefined();
    expect(Array.isArray(reachUpdate?.tileKeys)).toBe(true);
    expect((reachUpdate?.tileKeys as string[]).length).toBeGreaterThan(0);
    // The client drops any arrival at or below the revision it already applied
    // (client-reach-authoritative.ts), so the push must carry a real revision.
    expect(reachUpdate?.revision).toBeTypeOf("number");
    expect(reachUpdate?.revision as number).toBeGreaterThanOrEqual(1);
  });
});
