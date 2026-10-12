import { describe, expect, it } from "vitest";
import { lastManpowerRefillAtMs, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, TOWN_MANPOWER_BY_TIER } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

type PlayerUpdateEvent = Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }>;

// A moment well past epoch so the player's refill boundary is unambiguous.
const NOW = 40 * MANPOWER_REFILL_WINDOW_MS + 5_000_000;
const MINUTE = 60_000;

const runtimeAt = (now: () => number, player: Parameters<typeof buildPlayer>[1]): SimulationRuntime =>
  new SimulationRuntime({
    now,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP, ...player })]]),
    seedTiles: new Map(),
    initialState: { tiles: [], activeLocks: [] }
  });

describe("periodic manpower refill (runtime)", () => {
  it("credits regen up to the last refill boundary before exporting player state", () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    const runtime = runtimeAt(() => boundary + 10_000, { manpower: 0, manpowerUpdatedAt: boundary - MINUTE });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    // One minute of regen sat before the boundary; the 10s after it is still pending.
    expect(player?.manpower).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, 10);
  });

  it("pays nothing mid-window: manpower holds until the next boundary", () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    const runtime = runtimeAt(() => boundary + MANPOWER_REFILL_WINDOW_MS - 1_000, { manpower: 5, manpowerUpdatedAt: boundary });
    const player = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(player?.manpower).toBe(5);
  });

  it("pays the whole window in one chunk once the boundary passes", () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    let now = boundary + MANPOWER_REFILL_WINDOW_MS - 1_000;
    const runtime = runtimeAt(() => now, { manpower: 5, manpowerUpdatedAt: boundary });
    expect(runtime.exportState().players.find((entry) => entry.id === "player-1")?.manpower).toBe(5);
    now = boundary + MANPOWER_REFILL_WINDOW_MS + 1_000;
    const refilled = runtime.exportState().players.find((entry) => entry.id === "player-1")?.manpower ?? 0;
    expect(refilled).toBeCloseTo(5 + STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE * (MANPOWER_REFILL_WINDOW_MS / MINUTE), 6);
  });

  it("keeps the pending part of the window across settles (a settle mid-window loses nothing)", () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    let now = boundary + 30 * MINUTE;
    const runtime = runtimeAt(() => now, { manpower: 0, manpowerUpdatedAt: boundary });
    runtime.exportState(); // settles at mid-window; must not advance the anchor past the boundary
    now = boundary + MANPOWER_REFILL_WINDOW_MS + MINUTE;
    const refilled = runtime.exportState().players.find((entry) => entry.id === "player-1")?.manpower ?? 0;
    expect(refilled).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE * (MANPOWER_REFILL_WINDOW_MS / MINUTE), 6);
  });

  it("does not bank regen while full: manpower spent after sitting at cap waits for the next refill", () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    let now = boundary + 10 * MINUTE;
    const runtime = runtimeAt(() => now, { manpower: STARTING_CAPITAL_MANPOWER_CAP, manpowerUpdatedAt: boundary - 8 * MANPOWER_REFILL_WINDOW_MS });
    runtime.exportState(); // full at 10 minutes into the window
    const players = (runtime as unknown as { state: { players: Map<string, { manpower: number }> } }).state.players;
    players.get("player-1")!.manpower = 0; // spend everything right away
    now = boundary + MANPOWER_REFILL_WINDOW_MS + MINUTE;
    const refilled = runtime.exportState().players.find((entry) => entry.id === "player-1")?.manpower ?? 0;
    // Only the 230 minutes after it dropped below cap count, not the 10 spent at cap.
    expect(refilled).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE * (MANPOWER_REFILL_WINDOW_MS / MINUTE - 10), 6);
  });

  it("emits town-scaled manpower regen in player updates and credits it at the refill boundary", async () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    let currentNow = boundary - 30_000;
    const town = (x: number, name: string) => ({
      x,
      y: 10,
      terrain: "LAND" as const,
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      town: { name, type: "MARKET" as const, populationTier: "SETTLEMENT" as const, goldPerMinute: 1 }
    });
    const runtime = new SimulationRuntime({
      now: () => currentNow,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 0, manpowerUpdatedAt: boundary - MINUTE, manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP })]
      ]),
      seedTiles: new Map(),
      initialState: { tiles: [town(10, "Alpha"), town(11, "Beta")], activeLocks: [] }
    });
    const seen = collectEvents(runtime);
    const collect = (commandId: string, clientSeq: number): void => {
      runtime.submitCommand({ commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: currentNow, type: "COLLECT_VISIBLE", payloadJson: "{}" });
    };
    const latestUpdate = (): { manpower: number; manpowerCap: number; manpowerRegenPerMinute: number } => {
      const event = seen
        .slice()
        .reverse()
        .find((entry): entry is PlayerUpdateEvent => entry.eventType === "PLAYER_MESSAGE" && entry.messageType === "PLAYER_UPDATE");
      return JSON.parse(event!.payloadJson) as { manpower: number; manpowerCap: number; manpowerRegenPerMinute: number };
    };

    collect("collect-1", 1);
    await Promise.resolve();
    const before = latestUpdate();
    const settlementRegen = TOWN_MANPOWER_BY_TIER.SETTLEMENT.regenPerMinute;
    const regen = STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + settlementRegen * 2; // starting capital (§4.3) is additive on top of town regen
    expect(before.manpowerCap).toBe(STARTING_CAPITAL_MANPOWER_CAP + TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap * 2);
    expect(before.manpowerRegenPerMinute).toBe(regen);
    // Cap growth from the two towns is granted immediately (existing rule); regen is not, so `before` is the baseline.
    expect(before.manpower).toBe(TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap * 2);

    currentNow = boundary + 30_000;
    collect("collect-2", 2);
    await Promise.resolve();
    expect(latestUpdate().manpower - before.manpower).toBeCloseTo(regen, 10); // the one minute before the boundary
  });

  it("keeps banked regen across a snapshot round trip (a restart must not wipe the window)", () => {
    const boundary = lastManpowerRefillAtMs("player-1", NOW);
    const runtime = runtimeAt(() => boundary + 60 * MINUTE, { manpower: 0, manpowerUpdatedAt: boundary });
    runtime.exportState(); // settles: one hour banked, nothing spendable yet
    const recovered = createPlayersFromRecoveredState(runtime.exportSnapshotSections().initialState)?.get("player-1");
    expect(recovered?.manpowerBanked).toBeCloseTo(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE * 60, 9);
    expect(recovered?.manpower).toBe(0);
  });
});
