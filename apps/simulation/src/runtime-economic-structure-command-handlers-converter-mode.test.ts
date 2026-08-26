/**
 * Phase 7 tests for the converter mode-flip feature
 * (docs/plans/2026-08-06-converter-mode-flip.md):
 * - no-cap: a player can build and run more than one SYNTHESIZE-mode
 *   converter of the same resource, and flip several to SYNTHESIZE, with
 *   no rejection (Phase 8 regression test against the removed rule).
 * - cooldown: flips are gated by CONVERTER_MODE_FLIP_COOLDOWN_MS. A freshly
 *   built converter starts unlocked (no modeLockedUntil on build completion),
 *   so the owner gets one free first mode choice; the lock is set after that
 *   flip, same as any other flip. No-op flips must not restart the cooldown.
 * - upkeep: EXCHANGE-mode converters pay no gold upkeep, so they can be
 *   re-enabled with zero gold (Phase 4); SYNTHESIZE-mode ones still reject.
 * - back-compat: an absent converterMode behaves exactly like SYNTHESIZE.
 * - wire: a flip produces a TILE_DELTA_BATCH whose economicStructureJson
 *   carries the new mode + lock timestamp.
 */
import { describe, expect, it, vi } from "vitest";
import { CONVERTER_MODE_FLIP_COOLDOWN_MS } from "@border-empires/game-domain";
import { structureBuildDurationMs } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime/runtime.js";
import { buildPlayer, collectEvents } from "./runtime/runtime.test-helpers.js";

type RawPlayerRef = { manpower: number };

const converterTile = (x: number, y: number, type: string, overrides: Record<string, unknown> = {}) => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  economicStructure: { ownerId: "player-1", type, status: "active", ...overrides }
});

const buildRuntime = (extraTiles: Array<Record<string, unknown>> = [], points = 5_000, techIds: string[] = []) => {
  let currentNow = 1_000;
  const runtime = new SimulationRuntime({
    now: () => currentNow,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points, manpower: 10_000, techIds: new Set<string>(techIds), strategicResources: { FOOD: 100 } })]
    ]),
    initialState: {
      tiles: [
        {
          x: 16,
          y: 16,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { name: "Trade Hub", type: "MARKET", populationTier: "TOWN" }
        },
        { x: 16, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 16, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 16, y: 19, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        ...extraTiles
      ],
      activeLocks: []
    }
  });
  runtime.exportPlayerDebugSnapshot();
  (runtime as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get("player-1")!.manpower = 10_000;
  return { runtime, setNow: (t: number) => { currentNow = t; } };
};

const submitFlip = (runtime: SimulationRuntime, commandId: string, clientSeq: number, x: number, y: number, mode: "SYNTHESIZE" | "EXCHANGE") => {
  runtime.submitCommand({
    commandId,
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq,
    issuedAt: 1_000,
    type: "SET_CONVERTER_STRUCTURE_MODE",
    payloadJson: JSON.stringify({ x, y, mode })
  });
};

describe("converter mode flips (Phase 7)", () => {
  it("allows multiple SYNTHESIZE-mode converters of the same resource with no cap (regression test)", async () => {
    vi.useFakeTimers();
    try {
      // Build 3 FUR_SYNTHESIZERs across 3 towns — all in SYNTHESIZE mode (default).
      // With cap removed, all 3 should build and run simultaneously.
      const { runtime, setNow } = buildRuntime([
        { x: 18, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Town 2", type: "MARKET", populationTier: "TOWN" } },
        { x: 18, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 20, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Town 3", type: "MARKET", populationTier: "TOWN" } },
        { x: 20, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 22, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Town 4", type: "MARKET", populationTier: "TOWN" } },
        { x: 22, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ], 5_000, ["workshops"]);
      const seen = collectEvents(runtime);

      const buildAt = (commandId: string, clientSeq: number, x: number, y: number) =>
        runtime.submitCommand({
          commandId,
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq,
          issuedAt: 1_000,
          type: "BUILD_ECONOMIC_STRUCTURE",
          payloadJson: JSON.stringify({ x, y, structureType: "UMBRITE_SYNTHESIZER" })
        });

      // Build 3 converters sequentially
      buildAt("build-1", 1, 16, 16);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("UMBRITE_SYNTHESIZER"));

      buildAt("build-2", 2, 18, 16);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("UMBRITE_SYNTHESIZER"));

      buildAt("build-3", 3, 20, 16);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("UMBRITE_SYNTHESIZER"));

      // None should be rejected for cap
      const buildRejections = seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId.startsWith("build-"));
      expect(buildRejections).toHaveLength(0);

      // Now flip them all to EXCHANGE and back to SYNTHESIZE — no cap on flip
      setNow(1_000 + 3 * structureBuildDurationMs("UMBRITE_SYNTHESIZER") + CONVERTER_MODE_FLIP_COOLDOWN_MS + 1);

      // The BUILD_ECONOMIC_STRUCTURE command's (x, y) targets the town-support
      // resolution, which places the actual structure on the town's open
      // support tile (y+1 in this fixture) — so flips target that tile, not
      // the town tile itself.
      submitFlip(runtime, "flip-1-away", 4, 16, 17, "EXCHANGE");
      await Promise.resolve();

      setNow(1_000 + 3 * structureBuildDurationMs("UMBRITE_SYNTHESIZER") + 2 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 2);
      submitFlip(runtime, "flip-2-away", 5, 18, 17, "EXCHANGE");
      await Promise.resolve();

      setNow(1_000 + 3 * structureBuildDurationMs("UMBRITE_SYNTHESIZER") + 3 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 3);
      submitFlip(runtime, "flip-3-away", 6, 20, 17, "EXCHANGE");
      await Promise.resolve();

      // Flip all back to SYNTHESIZE — no rejections
      setNow(1_000 + 3 * structureBuildDurationMs("UMBRITE_SYNTHESIZER") + 4 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 4);
      submitFlip(runtime, "flip-1-back", 7, 16, 17, "SYNTHESIZE");
      await Promise.resolve();

      setNow(1_000 + 3 * structureBuildDurationMs("UMBRITE_SYNTHESIZER") + 5 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 5);
      submitFlip(runtime, "flip-2-back", 8, 18, 17, "SYNTHESIZE");
      await Promise.resolve();

      setNow(1_000 + 3 * structureBuildDurationMs("UMBRITE_SYNTHESIZER") + 6 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 6);
      submitFlip(runtime, "flip-3-back", 9, 20, 17, "SYNTHESIZE");
      await Promise.resolve();

      const flipRejections = seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId.startsWith("flip-"));
      expect(flipRejections).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a flip while the cooldown lock is active and allows it once it expires", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, setNow } = buildRuntime([
        converterTile(15, 16, "TITANIUM_WORKS", { converterMode: "SYNTHESIZE", modeLockedUntil: 1_000 + CONVERTER_MODE_FLIP_COOLDOWN_MS / 2 })
      ]);
      const seen = collectEvents(runtime);

      submitFlip(runtime, "flip-locked", 1, 15, 16, "EXCHANGE");
      await Promise.resolve();
      const locked = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-locked");
      expect(locked).toMatchObject({ code: "STRUCTURE_MODE_LOCKED" });

      setNow(1_000 + CONVERTER_MODE_FLIP_COOLDOWN_MS / 2 + 1);
      submitFlip(runtime, "flip-unlocked", 2, 15, 16, "EXCHANGE");
      await Promise.resolve();
      expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-unlocked")).toHaveLength(0);
      const exported = runtime.exportState().tiles.find((tile) => tile.x === 15 && tile.y === 16);
      expect(JSON.parse(exported!.economicStructureJson)).toMatchObject({ converterMode: "EXCHANGE" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not lock on build completion, so a fresh converter can flip immediately, then locks after that flip", async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = buildRuntime([], 5_000, ["workshops"]);
      const seen = collectEvents(runtime);

      runtime.submitCommand({
        commandId: "build-fresh",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "BUILD_ECONOMIC_STRUCTURE",
        payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "UMBRITE_SYNTHESIZER" })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("UMBRITE_SYNTHESIZER"));

      const exported = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
      const structure = JSON.parse(exported!.economicStructureJson);
      expect(structure.status).toBe("active");
      expect(structure.modeLockedUntil).toBeUndefined();

      submitFlip(runtime, "flip-fresh", 2, 16, 17, "EXCHANGE");
      await Promise.resolve();
      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-fresh");
      expect(rejected).toBeUndefined();

      const afterFlip = runtime.exportState().tiles.find((tile) => tile.x === 16 && tile.y === 17);
      const flippedStructure = JSON.parse(afterFlip!.economicStructureJson);
      expect(flippedStructure).toMatchObject({ converterMode: "EXCHANGE" });
      expect(flippedStructure.modeLockedUntil).toBeGreaterThan(0);

      // Now locked out — a second flip right away must be rejected.
      submitFlip(runtime, "flip-fresh-again", 3, 16, 17, "SYNTHESIZE");
      await Promise.resolve();
      const rejectedAgain = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-fresh-again");
      expect(rejectedAgain).toMatchObject({ code: "STRUCTURE_MODE_LOCKED" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start or restart the cooldown on a no-op flip to the same mode", async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = buildRuntime([converterTile(15, 16, "TITANIUM_WORKS", { converterMode: "SYNTHESIZE" })]);
      const seen = collectEvents(runtime);

      // Same-mode flip resolves and leaves the structure unlocked, so an
      // immediately following real flip is not gated by a freshly-started lock.
      submitFlip(runtime, "noop", 1, 15, 16, "SYNTHESIZE");
      await Promise.resolve();
      expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "noop")).toHaveLength(0);
      const afterNoop = runtime.exportState().tiles.find((tile) => tile.x === 15 && tile.y === 16);
      expect(JSON.parse(afterNoop!.economicStructureJson)).toMatchObject({ converterMode: "SYNTHESIZE" });
      expect(JSON.parse(afterNoop!.economicStructureJson).modeLockedUntil).toBeUndefined();

      submitFlip(runtime, "flip-after-noop", 2, 15, 16, "EXCHANGE");
      await Promise.resolve();
      expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-after-noop")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows re-enabling an EXCHANGE-mode converter with zero gold (no gold upkeep) and rejects a SYNTHESIZE-mode one", async () => {
    vi.useFakeTimers();
    try {
      const exchange = buildRuntime(
        [converterTile(15, 16, "TITANIUM_WORKS", { status: "inactive", inactiveReason: "manual", converterMode: "EXCHANGE" })],
        0
      );
      const exchangeSeen = collectEvents(exchange.runtime);
      exchange.runtime.submitCommand({
        commandId: "re-enable-exchange",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SET_CONVERTER_STRUCTURE_ENABLED",
        payloadJson: JSON.stringify({ x: 15, y: 16, enabled: true })
      });
      await Promise.resolve();
      expect(exchangeSeen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "re-enable-exchange")).toBeFalsy();

      const synth = buildRuntime([converterTile(15, 17, "TITANIUM_WORKS", { status: "inactive", inactiveReason: "manual" })], 0);
      const synthSeen = collectEvents(synth.runtime);
      synth.runtime.submitCommand({
        commandId: "re-enable-synth",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "SET_CONVERTER_STRUCTURE_ENABLED",
        payloadJson: JSON.stringify({ x: 15, y: 17, enabled: true })
      });
      await Promise.resolve();
      const rejected = synthSeen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "re-enable-synth");
      expect(rejected).toMatchObject({ code: "STRUCTURE_TOGGLE_INVALID" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats an absent converterMode as SYNTHESIZE for back-compat (no cap enforcement)", async () => {
    vi.useFakeTimers();
    try {
      // Two converters with no converterMode — both default to SYNTHESIZE.
      // With cap removed, flipping one to EXCHANGE and back should have no cap rejection.
      const { runtime, setNow } = buildRuntime([
        converterTile(15, 16, "UMBRITE_SYNTHESIZER"),
        converterTile(15, 17, "UMBRITE_SYNTHESIZER")
      ]);
      const seen = collectEvents(runtime);

      submitFlip(runtime, "a-away", 1, 15, 16, "EXCHANGE");
      await Promise.resolve();
      setNow(1_000 + CONVERTER_MODE_FLIP_COOLDOWN_MS + 1);
      submitFlip(runtime, "b-away", 2, 15, 17, "EXCHANGE");
      await Promise.resolve();
      expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED")).toHaveLength(0);

      setNow(1_000 + 2 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 2);
      submitFlip(runtime, "a-back", 3, 15, 16, "SYNTHESIZE");
      await Promise.resolve();
      expect(seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "a-back")).toHaveLength(0);

      setNow(1_000 + 3 * CONVERTER_MODE_FLIP_COOLDOWN_MS + 3);
      submitFlip(runtime, "b-back", 4, 15, 17, "SYNTHESIZE");
      await Promise.resolve();
      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "b-back");
      expect(rejected).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a TILE_DELTA_BATCH carrying the new converterMode and lock timestamp on the wire", async () => {
    vi.useFakeTimers();
    try {
      const { runtime } = buildRuntime([converterTile(15, 16, "UMBRITE_SYNTHESIZER")]);
      const batches: Array<{ x: number; y: number; economicStructureJson?: string }>[] = [];
      runtime.onEvent((event) => {
        if (event.eventType === "TILE_DELTA_BATCH" && event.commandId === "flip-wire") batches.push(event.tileDeltas);
      });

      submitFlip(runtime, "flip-wire", 1, 15, 16, "EXCHANGE");
      await Promise.resolve();

      expect(batches).toHaveLength(1);
      const delta = batches[0][0];
      expect(delta).toMatchObject({ x: 15, y: 16 });
      const structure = JSON.parse(delta.economicStructureJson!);
      expect(structure).toMatchObject({ converterMode: "EXCHANGE" });
      expect(structure.modeLockedUntil).toBe(1_000 + CONVERTER_MODE_FLIP_COOLDOWN_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it("charges the first upkeep interval when flipping to SYNTHESIZE and rejects the flip if the player cannot cover it", async () => {
    vi.useFakeTimers();
    try {
      // Zero gold: flipping EXCHANGE -> SYNTHESIZE must be rejected, since the
      // flip immediately owes the first upkeep interval (plan §Phase 2).
      const poor = buildRuntime([converterTile(15, 16, "TITANIUM_WORKS", { converterMode: "EXCHANGE" })], 0);
      const poorSeen = collectEvents(poor.runtime);
      submitFlip(poor.runtime, "flip-poor", 1, 15, 16, "SYNTHESIZE");
      await Promise.resolve();
      const rejected = poorSeen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-poor");
      expect(rejected).toMatchObject({ code: "STRUCTURE_MODE_INVALID" });
      const stillExchange = poor.runtime.exportState().tiles.find((tile) => tile.x === 15 && tile.y === 16);
      expect(JSON.parse(stillExchange!.economicStructureJson)).toMatchObject({ converterMode: "EXCHANGE" });

      // Enough gold: the flip succeeds and gold is actually spent.
      const rich = buildRuntime([converterTile(15, 16, "TITANIUM_WORKS", { converterMode: "EXCHANGE" })], 5_000);
      const richSeen = collectEvents(rich.runtime);
      const playerBefore = (rich.runtime as unknown as { state: { players: Map<string, { points: number }> } }).state.players.get("player-1")!.points;
      submitFlip(rich.runtime, "flip-rich", 1, 15, 16, "SYNTHESIZE");
      await Promise.resolve();
      expect(richSeen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "flip-rich")).toHaveLength(0);
      const playerAfter = (rich.runtime as unknown as { state: { players: Map<string, { points: number }> } }).state.players.get("player-1")!.points;
      expect(playerAfter).toBeLessThan(playerBefore);
      const flipped = rich.runtime.exportState().tiles.find((tile) => tile.x === 15 && tile.y === 16);
      expect(JSON.parse(flipped!.economicStructureJson)).toMatchObject({ converterMode: "SYNTHESIZE" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows building multiple converters of the same family when the first is in EXCHANGE mode (no build-time cap)", async () => {
    vi.useFakeTimers();
    try {
      // Two separate towns so the per-town "already has a Fur Synthesizer"
      // check can't fire — only the empire-wide family cap could reject.
      const { runtime, setNow } = buildRuntime([
        { x: 18, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Second Hub", type: "MARKET", populationTier: "TOWN" } },
        { x: 18, y: 17, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ], 5_000, ["workshops"]);
      const seen = collectEvents(runtime);

      const buildAt = (commandId: string, clientSeq: number, x: number, y: number) =>
        runtime.submitCommand({
          commandId,
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq,
          issuedAt: 1_000,
          type: "BUILD_ECONOMIC_STRUCTURE",
          payloadJson: JSON.stringify({ x, y, structureType: "UMBRITE_SYNTHESIZER" })
        });

      // First converter (town 1) completes in SYNTHESIZE (default)
      buildAt("build-first", 1, 16, 16);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("UMBRITE_SYNTHESIZER"));

      // Second converter at town 2 should also build (no cap)
      buildAt("build-second-ok", 2, 18, 16);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("UMBRITE_SYNTHESIZER"));

      const capped = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "build-second-ok");
      expect(capped).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows stacking multiple Aether Condensers (CRYSTAL_SYNTHESIZER) on the same town's support ring", async () => {
    vi.useFakeTimers();
    try {
      // Give the default town (16,16) a second open support tile at
      // (17,16) — (16,17) is already open in buildRuntime's base tiles.
      const { runtime } = buildRuntime([
        { x: 17, y: 16, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ], 5_000, ["crystal-lattices"]);
      const seen = collectEvents(runtime);

      const buildAt = (commandId: string, clientSeq: number) =>
        runtime.submitCommand({
          commandId,
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq,
          issuedAt: 1_000,
          type: "BUILD_ECONOMIC_STRUCTURE",
          payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "CRYSTAL_SYNTHESIZER" })
        });

      // Both builds target the town tile itself; resolveTownSupportTarget
      // auto-places each one onto a different open support tile.
      buildAt("build-first-condenser", 1);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("CRYSTAL_SYNTHESIZER"));

      buildAt("build-second-condenser", 2);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("CRYSTAL_SYNTHESIZER"));

      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "build-second-condenser");
      expect(rejected).toBeUndefined();

      const tiles = runtime.exportState().tiles;
      const condenserTiles = tiles.filter((tile) => tile.economicStructureJson?.includes("CRYSTAL_SYNTHESIZER"));
      expect(condenserTiles).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a second Aether Condenser at a town with no open support tiles left, with the renamed label", async () => {
    vi.useFakeTimers();
    try {
      // Only one open support tile: (16,17). No room for a second condenser.
      const { runtime } = buildRuntime([], 5_000, ["crystal-lattices"]);
      const seen = collectEvents(runtime);

      const buildAt = (commandId: string, clientSeq: number) =>
        runtime.submitCommand({
          commandId,
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq,
          issuedAt: 1_000,
          type: "BUILD_ECONOMIC_STRUCTURE",
          payloadJson: JSON.stringify({ x: 16, y: 16, structureType: "CRYSTAL_SYNTHESIZER" })
        });

      buildAt("build-first-condenser", 1);
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("CRYSTAL_SYNTHESIZER"));

      buildAt("build-second-condenser", 2);
      await Promise.resolve();

      const rejected = seen.find((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "build-second-condenser");
      expect(rejected).toMatchObject({ code: "BUILD_INVALID", message: expect.stringContaining("aether condenser") });
    } finally {
      vi.useRealTimers();
    }
  });
});