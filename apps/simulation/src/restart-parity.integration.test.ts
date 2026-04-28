import { describe, it, expect, beforeEach } from "vitest";
import { createSimulationService } from "./simulation-service.js";
import { InMemorySimulationCommandStore } from "./command-store.js";
import { InMemorySimulationEventStore } from "./event-store.js";
import { InMemorySimulationSnapshotStore } from "./snapshot-store.js";
import { RESTART_PARITY_COMMAND_TYPES } from "../../../packages/sim-protocol/src/command-coverage-sets.js";

const PLAYER_ID = "player-1";
const FIXED_NOW_MS = 1_000;

/** Boot a simulation with shared stores and a very low checkpoint threshold. */
const bootSim = async (options: {
  commandStore: InMemorySimulationCommandStore;
  eventStore: InMemorySimulationEventStore;
  snapshotStore: InMemorySimulationSnapshotStore;
}) => {
  const service = await createSimulationService({
    commandStore: options.commandStore,
    eventStore: options.eventStore,
    snapshotStore: options.snapshotStore,
    checkpointEveryEvents: 1, // checkpoint as often as possible for test reliability
    runtimeOptions: { now: () => FIXED_NOW_MS },
    seedProfile: "default",
    enableAiAutopilot: false,
    enableSystemAutopilot: false,
    allowSeedRecoveryFallback: true,
    port: 0 // random port so tests don't clash
  });
  return service;
};

type RestartCommandType = (typeof RESTART_PARITY_COMMAND_TYPES)[number];

const payloadForCommand = (type: RestartCommandType): Record<string, unknown> => {
  switch (type) {
    case "ATTACK":
    case "EXPAND":
    case "BREAKTHROUGH_ATTACK":
    case "CAST_AETHER_BRIDGE":
    case "CAST_AETHER_WALL":
    case "AIRPORT_BOMBARD":
      return { fromX: 10, fromY: 10, toX: 11, toY: 10 };
    case "SETTLE":
      return { x: 999, y: 999 };
    case "BUILD_FORT":
    case "BUILD_OBSERVATORY":
    case "BUILD_SIEGE_OUTPOST":
    case "CANCEL_FORT_BUILD":
    case "CANCEL_STRUCTURE_BUILD":
    case "REMOVE_STRUCTURE":
    case "CANCEL_SIEGE_OUTPOST_BUILD":
    case "CANCEL_CAPTURE":
    case "UNCAPTURE_TILE":
    case "COLLECT_TILE":
    case "OVERLOAD_SYNTHESIZER":
    case "SIPHON_TILE":
    case "PURGE_SIPHON":
    case "CREATE_MOUNTAIN":
    case "REMOVE_MOUNTAIN":
    case "COLLECT_SHARD":
      return { x: 10, y: 10 };
    case "BUILD_ECONOMIC_STRUCTURE":
      return { x: 10, y: 10, structureType: "MARKET" };
    case "COLLECT_VISIBLE":
      return {};
    case "CHOOSE_TECH":
      return { techId: "agriculture" };
    case "CHOOSE_DOMAIN":
      return { domainId: "frontier-doctrine" };
    case "SET_CONVERTER_STRUCTURE_ENABLED":
      return { x: 10, y: 10, enabled: true };
    case "REVEAL_EMPIRE":
    case "REVEAL_EMPIRE_STATS":
      return { targetPlayerId: "ai-1" };
  }
};

describe("restart parity (in-memory stores)", () => {
  let commandStore: InMemorySimulationCommandStore;
  let eventStore: InMemorySimulationEventStore;
  let snapshotStore: InMemorySimulationSnapshotStore;

  beforeEach(() => {
    commandStore = new InMemorySimulationCommandStore();
    eventStore = new InMemorySimulationEventStore();
    snapshotStore = new InMemorySimulationSnapshotStore();
  });

  it.each(RESTART_PARITY_COMMAND_TYPES)("replays %s state across a cold restart", async (type) => {
    const serviceBeforeRestart = await bootSim({ commandStore, eventStore, snapshotStore });
    const commandId = `restart-${type.toLowerCase()}`;
    serviceBeforeRestart.runtime.submitCommand({
      commandId,
      sessionId: "session-1",
      playerId: PLAYER_ID,
      clientSeq: 1,
      issuedAt: FIXED_NOW_MS,
      type,
      payloadJson: JSON.stringify(payloadForCommand(type))
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const beforeRestartState = serviceBeforeRestart.runtime.exportState();
    const persistedRuntimeSnapshot = serviceBeforeRestart.runtime.snapshot();
    await serviceBeforeRestart.close();

    expect(persistedRuntimeSnapshot.commands.some((command) => command.commandId === commandId)).toBe(true);

    const persistedCommandEvents = await eventStore.loadEventsForCommand(commandId);
    if (persistedCommandEvents.length > 0) {
      expect(
        persistedCommandEvents.some((event) =>
          event.eventType === "COMMAND_ACCEPTED" ||
          event.eventType === "COMMAND_REJECTED" ||
          event.eventType === "COLLECT_RESULT" ||
          event.eventType === "TECH_UPDATE" ||
          event.eventType === "DOMAIN_UPDATE" ||
          event.eventType === "TILE_DELTA_BATCH" ||
          event.eventType === "PLAYER_MESSAGE"
        )
      ).toBe(true);
    }

    const serviceAfterRestart = await bootSim({ commandStore, eventStore, snapshotStore });
    const afterRestartState = serviceAfterRestart.runtime.exportState();
    await serviceAfterRestart.close();

    expect(afterRestartState).toEqual(beforeRestartState);
  });
});

describe("command store — idempotency and player-seq uniqueness", () => {
  it("persistQueuedCommand with duplicate commandId is a no-op (does not throw)", async () => {
    const store = new InMemorySimulationCommandStore();
    const envelope = {
      commandId: "cmd-1",
      sessionId: "s1",
      playerId: PLAYER_ID,
      clientSeq: 1,
      issuedAt: Date.now(),
      type: "ATTACK" as const,
      payloadJson: "{}"
    };
    await store.persistQueuedCommand(envelope, Date.now());
    // Duplicate — must not throw
    await expect(store.persistQueuedCommand(envelope, Date.now())).resolves.not.toThrow();
    // Still only one command stored
    const all = await store.loadAllCommands();
    expect(all.filter((c) => c.commandId === "cmd-1")).toHaveLength(1);
  });

  it("(playerId, clientSeq) collision silently skips the second command", async () => {
    const store = new InMemorySimulationCommandStore();
    await store.persistQueuedCommand(
      { commandId: "cmd-1", sessionId: "s1", playerId: PLAYER_ID, clientSeq: 1, issuedAt: Date.now(), type: "ATTACK" as const, payloadJson: "{}" },
      Date.now()
    );
    await store.persistQueuedCommand(
      { commandId: "cmd-2", sessionId: "s1", playerId: PLAYER_ID, clientSeq: 1, issuedAt: Date.now(), type: "EXPAND" as const, payloadJson: "{}" },
      Date.now()
    );
    const all = await store.loadAllCommands();
    // cmd-2 should be silently dropped — only cmd-1 with that seq exists
    expect(all.find((c) => c.commandId === "cmd-2")).toBeUndefined();
    expect(all.find((c) => c.commandId === "cmd-1")).toBeDefined();
  });

  it("findByPlayerSeq returns the correct command", async () => {
    const store = new InMemorySimulationCommandStore();
    await store.persistQueuedCommand(
      { commandId: "cmd-99", sessionId: "s1", playerId: PLAYER_ID, clientSeq: 99, issuedAt: Date.now(), type: "ATTACK" as const, payloadJson: "{}" },
      Date.now()
    );
    const found = await store.findByPlayerSeq(PLAYER_ID, 99);
    expect(found?.commandId).toBe("cmd-99");
    const notFound = await store.findByPlayerSeq(PLAYER_ID, 100);
    expect(notFound).toBeUndefined();
  });
});
