import { afterEach, describe, expect, it } from "vitest";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { createRealtimeGatewayApp } from "./gateway-app.js";
import { createSimulationService } from "../../../simulation/src/simulation-service/simulation-service.js";
import { afcModuleFixtureTile } from "../../../simulation/src/afc-test-fixture/afc-test-fixture.js";
import {
  closeSocket, createStartupSnapshotStore, flushScheduledTasks, nextNonBootstrapMessage,
  openSocket, silentLog, waitUntil
} from "./rewrite-stack-test-helpers.js";

describe("Manufactory gateway integration", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  it("supports economic structure build commands through the rewrite gateway", async () => {
    const scheduledBuilds: Array<{ delayMs: number; task: () => void }> = [];
    const gatewayCommandStore = new InMemoryGatewayCommandStore();
    const snapshotStore = await createStartupSnapshotStore({
      tiles: [
        afcModuleFixtureTile("player-1"),
        {
          x: 16,
          y: 16,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
        },
        {
          x: 16,
          y: 17,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED"
        },
        // TOWN_FOOD_SLOT_DEMAND: the town draws 4 FOOD slots, MANUFACTORY draws 1 more.
        { x: 16, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 21, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 22, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
      ],
      activeLocks: [],
      players: [
        {
          id: "player-1",
          points: 10_000,
          manpower: 10_000,
          techIds: ["trade"]
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
    expect((await nextNonBootstrapMessage(socket, "manufactory init")).type).toBe("INIT");
    socket.socket.send(JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx: 0, cy: 0, radius: 4 }));

    socket.socket.send(
      JSON.stringify({
        type: "BUILD_ECONOMIC_STRUCTURE",
        x: 16,
        y: 16,
        structureType: "MANUFACTORY",
        commandId: "manufactory-cmd-1",
        clientSeq: 1
      })
    );

    const queued = await nextNonBootstrapMessage(socket, "manufactory queued");
    // dispatchDurableCommand assigns clientSeq at the gateway.
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

    // The build command targets (16,16) — the town's own tile — same as
    // pressing Manufactory in the build menu while looking at the town. Per
    // resolveTownSupportTarget in runtime-structure-command-handlers.ts
    // ("the only structure that belongs directly ON a town tile is a
    // Fort"), MANUFACTORY is redirected to the nearest open support tile via
    // firstAvailableTownSupportTile — which only ever considers the town's
    // neighbor tiles, never the town's own coordinates — so the structure
    // lands at (16,17), the one plain open support tile in this fixture's
    // neighbor ring, and (16,16) never gets an economicStructureJson at
    // all. A previous version of this test/comment incorrectly asserted
    // the opposite (that Manufactory lands ON the town tile) and always
    // failed as a result — confirmed against the real redirect logic, not
    // a flake.
    await waitUntil(() => {
      const tile = simulation.runtime.exportState().tiles.find((candidate) => candidate.x === 16 && candidate.y === 17);
      return typeof tile?.economicStructureJson === "string" &&
        tile.economicStructureJson.includes("\"type\":\"MANUFACTORY\"") &&
        tile.economicStructureJson.includes("\"status\":\"active\"");
    }, 8_000);
    const exportedEconomicTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
    expect(exportedEconomicTile?.economicStructureJson).toContain("\"type\":\"MANUFACTORY\"");
    expect(exportedEconomicTile?.economicStructureJson).toContain("\"status\":\"active\"");
    const townTile = simulation.runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 16);
    expect(townTile?.economicStructureJson ?? null).toBeFalsy();

    await waitUntil(async () => (await gatewayCommandStore.get(commandId))?.status === "RESOLVED");
  }, 20_000);

});
