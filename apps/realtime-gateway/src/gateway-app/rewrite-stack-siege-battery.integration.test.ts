import { afterEach, describe, expect, it } from "vitest";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { afcModuleFixtureTile } from "../../../simulation/src/afc-test-fixture/afc-test-fixture.js";
import {
  closeSocket, createStartupSnapshotStore, flushScheduledTasks, nextNonBootstrapMessage,
  openSocket, silentLog, waitUntil
} from "./rewrite-stack-test-helpers.js";

describe("Siege Battery gateway integration", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  it("supports siege battery build commands through the rewrite gateway", async () => {
    const scheduledBuilds: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const snapshotStore = await createStartupSnapshotStore({
      // §5: the UMBRITE tile backs the UMBRITE *slot* a Siege Battery needs; the stockpile below is retired and no longer gates the build.
      tiles: [afcModuleFixtureTile("player-1"), { x: 14, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }, { x: 15, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" }],
      activeLocks: [],
      players: [
        {
          id: "player-1",
          points: 5_000,
          manpower: 10_000,
          techIds: ["leatherworking"],
          strategicResources: { UMBRITE: 100 }
        }
      ]
    });
    const simulation = await createSimulationService({
      host: "127.0.0.1",
      port: 0,
      log: silentLog,
      snapshotStore,
      requireDurableStartupState: true,
      runtimeOptions: {
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledBuilds.push({ delayMs, task });
        }
      }
    });
    cleanup.push(() => simulation.close());
    const simulationAddress = await simulation.start();

    const gateway = await createRealtimeGatewayApp({
      host: "127.0.0.1",
      port: 0,
      logger: false,
      simulationAddress: simulationAddress.address,
      commandStore: gatewayCommandStore,
      defaultHumanPlayerId: "player-1"
    });
    cleanup.push(() => gateway.close());
    const gatewayAddress = await gateway.start();

    const socket = await openSocket(gatewayAddress.wsUrl);
    cleanup.push(() => closeSocket(socket.socket));
    socket.socket.send(JSON.stringify({ type: "AUTH", token: "player-1" }));
    expect((await nextNonBootstrapMessage(socket, "siege init")).type).toBe("INIT");
    socket.socket.send(JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 0, cy: 0, radius: 2 }));

    socket.socket.send(
      JSON.stringify({
        type: "BUILD_SIEGE_BATTERY",
        x: 14,
        y: 14,
        commandId: "siege-cmd-1",
        clientSeq: 1
      })
    );

    const queued = await nextNonBootstrapMessage(socket, "siege queued");
    // clientSeq is gateway-assigned here, not the client-supplied value sent
    // above -- BUILD_SIEGE_BATTERY is dispatched via dispatchDurableCommand,
    // which never forwards the client's own commandId/clientSeq (see
    // gateway-app.ts's dispatchDurableCommand). It now comes from a counter
    // space disjoint from client-tracked (e.g. EXPAND/ATTACK) clientSeq
    // values, so it's no longer the small positive number it used to
    // coincidentally be.
    expect(queued).toEqual(
      expect.objectContaining({
        type: "COMMAND_QUEUED",
        commandId: expect.any(String),
        clientSeq: expect.any(Number)
      })
    );
    const commandId = String(queued.commandId);

    await waitUntil(() => scheduledBuilds.length >= 1, 3_000).catch(() => undefined);
    flushScheduledTasks(scheduledBuilds, 0);

    await waitUntil(() => {
      const tile = simulation.runtime.exportState().tiles.find((candidate) => candidate.x === 14 && candidate.y === 14);
      return typeof tile?.siegeBatteryJson === "string" && tile.siegeBatteryJson.includes("\"status\":\"active\"");
    }, 8_000);
    const exportedSiegeTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 14 && tile.y === 14);
    expect(exportedSiegeTile?.siegeBatteryJson).toContain("\"status\":\"active\"");

    await waitUntil(async () => (await gatewayCommandStore.get(commandId))?.status === "RESOLVED");
  }, 20_000);
});
