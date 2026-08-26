import { describe, expect, it } from "vitest";
import {
  createInitialSeasonState,
  isSeasonActive,
  isSeasonEnded,
  isSeasonPending,
  maybeActivatePendingSeason,
  updateSeasonVictoryTrackers
} from "./season-lifecycle.js";

describe("createInitialSeasonState pending", () => {
  it("creates a pending season when scheduledStartAt is in the future", () => {
    const now = 1_000_000;
    const state = createInitialSeasonState({
      seasonSequence: 1,
      rulesetId: "standard",
      worldSeed: 1,
      startedAt: now,
      scheduledStartAt: now + 60_000
    });
    expect(state.status).toBe("pending");
    expect(state.scheduledStartAt).toBe(now + 60_000);
  });

  it("keeps today's behaviour (active) when scheduledStartAt is omitted", () => {
    const state = createInitialSeasonState({ seasonSequence: 1, rulesetId: "standard", worldSeed: 1, startedAt: 1_000 });
    expect(state.status).toBe("active");
    expect(state.scheduledStartAt).toBeUndefined();
  });

  it("creates an active season when scheduledStartAt is already in the past", () => {
    const now = 1_000_000;
    const state = createInitialSeasonState({
      seasonSequence: 1,
      rulesetId: "standard",
      worldSeed: 1,
      startedAt: now,
      scheduledStartAt: now - 60_000
    });
    expect(state.status).toBe("active");
    expect(state.scheduledStartAt).toBeUndefined();
  });
});

describe("maybeActivatePendingSeason", () => {
  const basePending = createInitialSeasonState({
    seasonSequence: 1,
    rulesetId: "standard",
    worldSeed: 1,
    startedAt: 1_000_000,
    scheduledStartAt: 1_060_000
  });

  it("no-ops before scheduledStartAt", () => {
    const result = maybeActivatePendingSeason(basePending, 1_059_999);
    expect(result.activated).toBe(false);
    expect(result.seasonState).toBe(basePending);
  });

  it("flips to active once scheduledStartAt has passed, stamping startedAt and clearing scheduledStartAt", () => {
    const result = maybeActivatePendingSeason(basePending, 1_060_500);
    expect(result.activated).toBe(true);
    expect(result.seasonState.status).toBe("active");
    expect(result.seasonState.startedAt).toBe(1_060_500);
    expect(result.seasonState.scheduledStartAt).toBeUndefined();
  });

  it("no-ops on an already-active season", () => {
    const active = createInitialSeasonState({ seasonSequence: 1, rulesetId: "standard", worldSeed: 1, startedAt: 1_000 });
    const result = maybeActivatePendingSeason(active, 2_000_000);
    expect(result.activated).toBe(false);
  });
});

describe("status predicates treat absent status as active (historical default)", () => {
  const legacySeasonState = {
    seasonId: "season-1",
    seasonSequence: 1,
    rulesetId: "standard",
    worldSeed: 1,
    startedAt: 1_000,
    victoryTrackers: []
  } as unknown as Parameters<typeof isSeasonActive>[0];

  it("isSeasonActive is true, isSeasonPending/isSeasonEnded are false", () => {
    expect(isSeasonActive(legacySeasonState)).toBe(true);
    expect(isSeasonPending(legacySeasonState)).toBe(false);
    expect(isSeasonEnded(legacySeasonState)).toBe(false);
  });
});

describe("updateSeasonVictoryTrackers no-ops while pending", () => {
  it("does not accrue hold timers for a pending season", () => {
    const pendingState = createInitialSeasonState({
      seasonSequence: 1,
      rulesetId: "standard",
      worldSeed: 1,
      startedAt: 1_000_000,
      scheduledStartAt: 2_000_000
    });
    const result = updateSeasonVictoryTrackers({
      seasonState: pendingState,
      objectives: [
        {
          id: "TOWN_CONTROL",
          name: "Town control",
          description: "",
          leaderPlayerId: "player-1",
          leaderName: "Player One",
          progressLabel: "",
          thresholdLabel: "",
          holdDurationSeconds: 60,
          statusLabel: "",
          conditionMet: true
        }
      ],
      now: 1_500_000
    });
    expect(result.changed).toBe(false);
    expect(result.crownedWinner).toBeUndefined();
    expect(result.seasonState.victoryTrackers).toEqual([]);
    expect(result.seasonState.status).toBe("pending");
  });
});
