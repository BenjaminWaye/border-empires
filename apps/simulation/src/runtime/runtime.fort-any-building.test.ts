import { describe, expect, it, vi } from "vitest";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";

// Regression: a Fort build was rejected with "tile already has structure" on
// a town support tile holding a Manufactory (or any economic structure other
// than a Relay Beacon / Harbor Exchange) or an Aether Tower. A fortification
// now shares a tile with any building; only a siege engine excludes it.
// See runtime-structure-command-handlers.ts's economicConflict check.

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


type Existing = { economicStructure?: { ownerId: string; type: "MANUFACTORY"; status: "active" }; observatory?: { ownerId: string; status: "active" }; siegeBattery?: { ownerId: string; variant: "SIEGE_BATTERY"; status: "active" } };

const buildFortOn = async (existing: Existing) => {
  const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
  for (let x = 0; x <= 20; x += 1) {
    for (let y = 5; y <= 15; y += 1) tiles.push({ x, y, terrain: "LAND" });
  }
  const runtime = new SimulationRuntime({
    now: () => Date.now(),
    initialPlayers: new Map([["player-1", makePlayer("player-1", ["masonry"])]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [afcModuleFixtureTile("player-1"),
        ...tiles,
        { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, ...existing },
        // A free TITANIUM slot — FORT's resource-slot requirement.
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
  const tile = runtime.exportVisibleStateForPlayer("player-1").tiles.find((t) => t.x === 10 && t.y === 10) as unknown as {
    fortJson?: string; economicStructureJson?: string; observatoryJson?: string;
  };
  const parse = (json: string | undefined) => (json ? JSON.parse(json) : undefined);
  return { rejections, fort: parse(tile?.fortJson), economicStructure: parse(tile?.economicStructureJson), observatory: parse(tile?.observatoryJson) };
};

describe("SimulationRuntime Fort shares a tile with any building", () => {
  it("builds a Fort on a tile with a Manufactory and keeps the Manufactory", async () => {
    vi.useFakeTimers();
    try {
      const result = await buildFortOn({ economicStructure: { ownerId: "player-1", type: "MANUFACTORY", status: "active" } });
      expect(result.rejections).toEqual([]);
      expect(result.fort).toMatchObject({ ownerId: "player-1", status: "active" });
      expect(result.economicStructure).toMatchObject({ type: "MANUFACTORY", status: "active" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a Fort on a tile with an Aether Tower and keeps the tower", async () => {
    vi.useFakeTimers();
    try {
      const result = await buildFortOn({ observatory: { ownerId: "player-1", status: "active" } });
      expect(result.rejections).toEqual([]);
      expect(result.fort).toMatchObject({ ownerId: "player-1", status: "active" });
      expect(result.observatory).toMatchObject({ status: "active" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("still rejects a Fort on a tile with a Siege Battery", async () => {
    vi.useFakeTimers();
    try {
      const result = await buildFortOn({ siegeBattery: { ownerId: "player-1", variant: "SIEGE_BATTERY", status: "active" } });
      expect(result.rejections).toEqual([{ code: "BUILD_INVALID", message: "tile already has structure" }]);
      expect(result.fort).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
