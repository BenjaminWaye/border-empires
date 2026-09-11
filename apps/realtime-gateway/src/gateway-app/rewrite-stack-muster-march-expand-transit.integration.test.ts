import { afterEach, describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { closeSocket, createStartupSnapshotStore, nextMatchingMessage, nextTypedMessage, openSocket, silentLog, waitUntil } from "./rewrite-stack-test-helpers.js";

// REGRESSION: a muster flag's ADVANCE/MARCH auto-fired EXPAND never carried
// the mechanical travel-time delay (transitEndsAt/musterOrigin) on the
// ACTION_ACCEPTED broadcast, even though the simulation's own COMMAND_ACCEPTED
// event always computes it identically for ATTACK and EXPAND alike
// (runtime-frontier-command.ts). The gateway forwarded those fields onto the
// ATTACK-only COMBAT_START message but never onto ACTION_ACCEPTED -- and
// EXPAND never gets a COMBAT_START at all, so its only broadcast silently
// dropped them. Client-side, that meant handleMusterAdvanceExpandAccepted
// (client-siege-tracking.ts) always stored a transitEndsAt-less entry, so the
// marching-company overlay (client-map-3d-muster-transit-overlay.ts) never
// rendered the travel leg for an auto-fired EXPAND.
describe("rewrite stack muster MARCH auto-fired EXPAND transit", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) await next();
    }
  });

  it("carries transitEndsAt/musterOrigin on ACTION_ACCEPTED for a MARCH-fired EXPAND", async () => {
    // Flag at (10,10) (with a town, so the zero-gross-income startup backstop
    // doesn't respawn-place over the neutral tile below), an owned corridor
    // at (10,11) so the flag's BFS has somewhere to walk, and a neutral LAND
    // tile at (10,12) for MARCH to claim on the way to its target at (10,14).
    const snapshotStore = await createStartupSnapshotStore({
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
        },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 10, y: 12, terrain: "LAND", ownershipState: "FRONTIER" },
        { x: 10, y: 14, terrain: "LAND", ownershipState: "FRONTIER" }
      ],
      activeLocks: [],
      players: [{ id: "player-1", points: 5_000, manpower: 10_000 }]
    });
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      snapshotStore,
      requireDurableStartupState: true,
      now: () => 1_000
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1",
      now: () => 1_000
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    await nextMatchingMessage(socket, "init", (m) => m.type === "INIT");

    // Stage manpower (HOLD) the same way the ATTACK regression test does,
    // then switch the same flag to MARCH with a target beyond (10,12).
    socket.socket.send(JSON.stringify({ type: "SET_MUSTER", x: 10, y: 10, mode: "HOLD", clientSeq: 1 }));
    const holdQueued = await nextTypedMessage(socket, "muster hold queued", "COMMAND_QUEUED");
    await waitUntil(async () => (await gatewayCommandStore.get((holdQueued as { commandId: string }).commandId))?.status !== "QUEUED");
    simulation.runtime.tickMuster(7_000);

    socket.socket.send(JSON.stringify({ type: "SET_MUSTER", x: 10, y: 10, mode: "MARCH", targetX: 10, targetY: 14, clientSeq: 2 }));
    const marchQueued = await nextTypedMessage(socket, "muster march queued", "COMMAND_QUEUED");
    await waitUntil(async () => (await gatewayCommandStore.get((marchQueued as { commandId: string }).commandId))?.status !== "QUEUED");
    expect((await gatewayCommandStore.get((marchQueued as { commandId: string }).commandId))?.status).toBe("RESOLVED");

    simulation.runtime.tickMuster(8_000);

    const actionAccepted = await nextMatchingMessage(
      socket,
      "muster march expand accepted",
      (m) => m.type === "ACTION_ACCEPTED" && m.actionType === "EXPAND"
    );

    expect(actionAccepted).toEqual(
      expect.objectContaining({
        type: "ACTION_ACCEPTED",
        actionType: "EXPAND",
        origin: { x: 10, y: 11 },
        target: { x: 10, y: 12 },
        transitEndsAt: expect.any(Number),
        musterOrigin: { x: 10, y: 10 }
      })
    );
  });
});
