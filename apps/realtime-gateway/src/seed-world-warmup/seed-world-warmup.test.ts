import { afterEach, describe, expect, it, vi } from "vitest";

const generation = vi.hoisted(() => ({ calls: 0 }));

// Stand-in for the real season-20ai worldgen (30-45s on staging).
vi.mock("../../../simulation/src/season-seed-world.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../simulation/src/season-seed-world.js")>();
  return {
    ...actual,
    createSeasonSeedWorld: (seed: number, createPlayer: Parameters<typeof actual.createSeasonSeedWorld>[1]) => {
      generation.calls += 1;
      return {
        players: new Map([
          ["player-1", createPlayer("player-1", false)],
          ["ai-1", createPlayer("ai-1", true)]
        ]),
        tiles: new Map([["1,1", { x: 1, y: 1, terrain: "LAND" as const }]]),
        docks: [],
        worldSeed: seed,
        significantIslandCount: 1,
        humanPlayers: 1,
        aiPlayers: 1,
        totalTiles: 1,
        totalSettledTiles: 0,
        totalTownTiles: 0,
        perPlayer: [{ playerId: "ai-1", isAi: true, settledTiles: 0, towns: 0 }]
      };
    }
  };
});

import { buildGatewayInitPayload } from "../init-payload/init-payload.js";
import { warmGatewaySeedWorld } from "./seed-world-warmup.js";

describe("warmGatewaySeedWorld", () => {
  afterEach(() => vi.restoreAllMocks());

  // Regression: the first login after every restart generated the whole
  // season-20ai world on the gateway main thread (45s on staging,
  // 2026-10-10), and every later login structuredClone'd all of it.
  it("builds the seed world at boot so logins neither generate nor copy it", () => {
    const logged: string[] = [];
    warmGatewaySeedWorld("season-20ai", (line) => logged.push(line));
    expect(generation.calls).toBe(1);
    expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({ msg: "gateway_seed_world_warmed", profile: "season-20ai" });

    const cloneSpy = vi.spyOn(globalThis, "structuredClone");
    const identity = { playerId: "player-1", playerName: "Tester" };
    const first = buildGatewayInitPayload(identity, undefined, "season-20ai");
    const second = buildGatewayInitPayload(identity, undefined, "season-20ai");

    expect(generation.calls).toBe(1);
    expect(cloneSpy).not.toHaveBeenCalled();
    expect(first.playerStyles.map((style) => style.id)).toEqual(expect.arrayContaining(["player-1", "ai-1"]));
    expect(second.runtimeIdentity.seededTileCount).toBe(1);
  });
});
