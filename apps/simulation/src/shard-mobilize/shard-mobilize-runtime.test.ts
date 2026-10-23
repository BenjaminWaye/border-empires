import { describe, expect, it } from "vitest";

import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "../runtime/runtime.js";

const NOW = 1_000;

// An established player who has been beaten down: settled before (so no
// one-time landing reserve applies), almost no manpower left, one Shard.
const beatenDownPlayer = (shards: number) => ({
  id: "player-1",
  isAi: false,
  points: 1_000,
  manpower: 5,
  manpowerUpdatedAt: NOW,
  landingReserveGranted: true,
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: shards },
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }
});

const runMobilize = async (shards: number) => {
  const seen: SimulationEvent[] = [];
  const runtime = new SimulationRuntime({
    now: () => NOW,
    initialPlayers: new Map([["player-1", beatenDownPlayer(shards)]]),
    seedTiles: new Map(),
    initialState: { tiles: [], activeLocks: [] }
  });
  runtime.onEvent((event) => seen.push(event));
  runtime.submitCommand({
    commandId: "mobilize-1",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: NOW,
    type: "SHARD_MOBILIZE",
    payloadJson: "{}"
  });
  await Promise.resolve();
  return { seen, player: runtime.exportState().players.find((p) => p.id === "player-1") };
};

describe("SHARD_MOBILIZE through the runtime dispatch", () => {
  it("routes the command to the handler: Shard spent, manpower refilled above the beaten-down level", async () => {
    const { seen, player } = await runMobilize(1);

    expect(seen.some((event) => event.eventType === "COMMAND_RESOLVED" && event.commandId === "mobilize-1")).toBe(true);
    expect(seen.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(false);
    expect(player?.strategicResources?.SHARD ?? 0).toBe(0);
    expect(player?.manpower ?? 0).toBeGreaterThan(5);
  });

  it("rejects with SHARD_MOBILIZE_INVALID when the player holds no Shard", async () => {
    const { seen, player } = await runMobilize(0);

    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toMatchObject({ code: "SHARD_MOBILIZE_INVALID" });
    expect(player?.manpower).toBe(5);
  });
});
