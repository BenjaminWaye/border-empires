import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, nextMatchingMessage, nextTypedMessage, openSocket, silentLog } from "./rewrite-stack-test-helpers.js";

// End-to-end smoke test for the Phase 0 activity-timeline plumbing (see
// docs/activity-dashboard-plan.md). Every other test for this feature mocks
// its own layer (aggregation, handler, sim-client), so none of them can
// catch a wire-level mismatch between simulation.proto's hand-declared
// request/response shapes and the gRPC handler/sim-client that consume them
// -- proto field names aren't typechecked against the .proto file itself.
// This test proves the real round trip (WS -> gateway -> gRPC -> sim ->
// gRPC -> gateway -> WS) actually works, and that both new message types
// are rejected pre-auth like every other authenticated message.
describe("activity timeline integration", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("rejects REQUEST_PERSONAL_ACTIVITY and ACKNOWLEDGE_ACTIVITY_SEEN before AUTH", async () => {
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

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));

    socket.socket.send(JSON.stringify({ type: "REQUEST_PERSONAL_ACTIVITY" }));
    expect(await nextTypedMessage(socket, "no-auth request", "ERROR")).toEqual(
      expect.objectContaining({ type: "ERROR", code: "NO_AUTH" })
    );

    socket.socket.send(JSON.stringify({ type: "ACKNOWLEDGE_ACTIVITY_SEEN", seenAt: 1, seasonId: "season-1" }));
    expect(await nextTypedMessage(socket, "no-auth acknowledge", "ERROR")).toEqual(
      expect.objectContaining({ type: "ERROR", code: "NO_AUTH" })
    );
  });

  // Include ERROR in the awaited reply so a missing gRPC method fails with its
  // real wire error instead of silently being skipped until the test timeout.
  it("delivers a real PERSONAL_ACTIVITY_TIMELINE over the full gRPC round trip once authenticated", async () => {
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

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextTypedMessage(socket, "init", "INIT")).activitySeen).toEqual({
      lastActivitySeenAt: 0,
      lastActivitySeenSeasonId: ""
    });

    socket.socket.send(JSON.stringify({ type: "REQUEST_PERSONAL_ACTIVITY" }));
    const timelineMessage = await nextMatchingMessage(
      socket,
      "personal activity timeline",
      (message) => message.type === "PERSONAL_ACTIVITY_TIMELINE" || message.type === "ERROR"
    );
    expect(timelineMessage).toEqual(
      expect.objectContaining({
        type: "PERSONAL_ACTIVITY_TIMELINE",
        timeline: expect.objectContaining({
          playerId: "player-1",
          cards: [],
          truncated: false
        })
      })
    );

    // The default seeded world's season id is "season-1" (see the
    // runtimeIdentity.seasonId on the INIT payload above) -- a matching
    // acknowledgement must succeed end-to-end, proving the real
    // getCurrentSeasonSummary() round trip (not just the mocked handler
    // test) actually validates against it.
    socket.socket.send(JSON.stringify({ type: "ACKNOWLEDGE_ACTIVITY_SEEN", seenAt: 500, seasonId: "season-1" }));
    expect(await nextTypedMessage(socket, "matching season ack", "ACTIVITY_SEEN_ACKNOWLEDGED")).toEqual({
      type: "ACTIVITY_SEEN_ACKNOWLEDGED",
      lastActivitySeenAt: 500,
      lastActivitySeenSeasonId: "season-1"
    });

    // A mismatched seasonId must be rejected end-to-end too.
    socket.socket.send(JSON.stringify({ type: "ACKNOWLEDGE_ACTIVITY_SEEN", seenAt: 600, seasonId: "season-99" }));
    expect(await nextTypedMessage(socket, "season mismatch", "ERROR")).toEqual(
      expect.objectContaining({ type: "ERROR", code: "ACTIVITY_SEEN_SEASON_MISMATCH" })
    );
  });
});
