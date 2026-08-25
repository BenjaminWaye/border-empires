import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, firebaseJwtFor, nextNonBootstrapMessage, openSocket, silentLog, withTimeout } from "./rewrite-stack-test-helpers.js";

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

  /**
   * Regression guard for the fix above overshooting its scope: the reach push
   * must fire only on the gateway's one true connect subscribe (trigger
   * "gateway_live_subscribe"), not on every non-bootstrap SubscribePlayer
   * call. A fog-disable resubscribe (SET_FOG_DISABLED -> refreshPlayerFogSnapshot
   * in gateway-app.ts) also calls SubscribePlayer with a non-bootstrap mode,
   * and re-fires roughly once per second while a fog-disabled player keeps
   * acting -- an unscoped push would force-flush a full REACH_UPDATE on that
   * cadence, bypassing the change filter entirely.
   */
  it("does not re-push reach on a fog-toggle resubscribe", async () => {
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
      fogAdminEmail: "fog-admin@example.com"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(
      JSON.stringify({
        type: "AUTH",
        token: firebaseJwtFor({
          sub: "firebase-fog-admin-1",
          user_id: "firebase-fog-admin-1",
          email: "fog-admin@example.com",
          name: "Fog Admin"
        })
      })
    );
    expect((await nextNonBootstrapMessage(socket, "init")).type).toBe("INIT");

    // Drain frames raw (not via nextNonBootstrapMessage, which silently
    // discards REACH_UPDATE) until the connect-time reach push is seen, so it
    // can't be mistaken for one triggered by the fog toggle below.
    let reachSeenCount = 0;
    let sawFogUpdate = false;
    let sawSnapshotReplace = false;
    let sentFogToggle = false;
    for (let frame = 0; frame < 60 && !(sawFogUpdate && sawSnapshotReplace); frame += 1) {
      const message = await socket.nextJsonMessage("post-init scan");
      if (message.type === "REACH_UPDATE") {
        reachSeenCount += 1;
        // Send the toggle only once the connect-time push has been observed,
        // so the two pushes can be told apart by what preceded them.
        if (!sentFogToggle) {
          sentFogToggle = true;
          socket.socket.send(JSON.stringify({ type: "SET_FOG_DISABLED", disabled: true }));
        }
        continue;
      }
      if (message.type === "FOG_UPDATE") { sawFogUpdate = true; continue; }
      if (message.type === "TILE_SNAPSHOT_REPLACE") { sawSnapshotReplace = true; continue; }
    }
    expect(sawFogUpdate).toBe(true);
    expect(sawSnapshotReplace).toBe(true);
    expect(reachSeenCount).toBe(1); // only the connect-time push -- none from the fog resubscribe

    // A short, bounded wait for any further raw frame confirms the fog
    // resubscribe truly produced no REACH_UPDATE, not just one lost in
    // ordering above.
    await expect(
      withTimeout(
        "unexpected message after fog toggle",
        new Promise<Record<string, unknown>>((resolve) => {
          socket.socket.addEventListener("message", (event) => resolve(JSON.parse(event.data) as Record<string, unknown>), { once: true });
        }),
        200
      )
    ).rejects.toThrow(/timed out/);
  });
});
