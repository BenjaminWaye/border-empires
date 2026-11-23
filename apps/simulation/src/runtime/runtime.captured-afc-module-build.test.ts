import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";

// Regression: capturing an AFC that carries a module you never researched
// (here the Titanium Forge Module, masonry) left its buildings locked -- the
// build gate demanded research as well as an installed copy. An installed
// module now unlocks its buildings whether it was researched or captured.

const makePlayer = (id: string, techIds: string[] = []) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 1_000,
  techIds: new Set<string>(techIds),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const capturedAfcTile = (modules: string[]) => ({
  x: 1,
  y: 1,
  terrain: "LAND" as const,
  ownerId: "player-1",
  ownershipState: "SETTLED" as const,
  afc: {
    ownerId: "player-1",
    status: "active" as const,
    activatedAt: 0,
    capturedAt: 0,
    modules,
    houseModules: [],
    capturedModuleHouses: Object.fromEntries(modules.map((id) => [id, "player-2"]))
  }
});

const buildFort = async (researched: string[], installed: string[]) => {
  const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
  for (let x = 0; x <= 20; x += 1) {
    for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
  }
  const runtime = new SimulationRuntime({
    now: () => Date.now(),
    initialPlayers: new Map([["player-1", makePlayer("player-1", researched)]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        capturedAfcTile(installed),
        ...tiles,
        { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const },
        // A free TITANIUM slot -- FORT's resource-slot requirement.
        { x: 0, y: 0, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "TITANIUM" as const }
      ],
      activeLocks: []
    }
  });
  const rejections: Array<{ code: string; message: string }> = [];
  runtime.onEvent((event) => {
    if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code, message: event.message });
  });
  runtime.submitCommand({
    commandId: "build-fort-1",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 0,
    issuedAt: Date.now(),
    type: "BUILD_STRUCTURE" as any,
    payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" })
  });
  await Promise.resolve();
  vi.advanceTimersByTime(structureBuildDurationMs("FORT"));
  await Promise.resolve();
  const tile = runtime.exportVisibleStateForPlayer("player-1").tiles.find((t) => t.x === 10 && t.y === 10) as unknown as { fortJson?: string };
  return { rejections, fort: tile?.fortJson ? JSON.parse(tile.fortJson) : undefined };
};

describe("SimulationRuntime captured AFC modules unlock their buildings", () => {
  it("builds a Fort from a captured Titanium Forge Module without researching it", async () => {
    vi.useFakeTimers();
    try {
      const result = await buildFort([], ["masonry"]);
      expect(result.rejections).toEqual([]);
      expect(result.fort).toMatchObject({ ownerId: "player-1", status: "active" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("still rejects the Fort when the module is neither researched nor installed", async () => {
    vi.useFakeTimers();
    try {
      const result = await buildFort([], []);
      expect(result.rejections).toEqual([{ code: "BUILD_INVALID", message: "unlock fort first" }]);
      expect(result.fort).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still requires a researched module to be installed", async () => {
    vi.useFakeTimers();
    try {
      const result = await buildFort(["masonry"], []);
      expect(result.rejections[0]?.code).toBe("BUILD_INVALID");
      expect(result.rejections[0]?.message).toMatch(/^Requires an active AFC with .+ installed$/);
      expect(result.fort).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
