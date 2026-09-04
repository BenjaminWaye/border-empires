import { describe, expect, it, vi } from "vitest";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

import { startImperialWardAutoStartTimer } from "./galaxy-endorsement-auto-start.js";
import { InMemoryGalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js";
import { InMemoryGalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";

const endedSummary = (overrides: Partial<CurrentSeasonSummary> = {}): CurrentSeasonSummary =>
  ({
    seasonId: "season-1",
    seasonSequence: 1,
    status: "ended",
    seasonWinner: {
      playerId: "emperor-1",
      playerName: "Nauticus",
      crownedAt: 0,
      objectiveId: "conquest",
      objectiveName: "Conquest"
    },
    ...overrides
  }) as CurrentSeasonSummary;

describe("Imperial Ward auto-start timer", () => {
  it("does not start the next season while the season is still active", async () => {
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary({ status: "active", seasonWinner: undefined }),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();
    expect(startNextSeason).not.toHaveBeenCalled();
  });

  it("does not auto-start before the 1h window has elapsed", async () => {
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary(),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      now: () => 59 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();
    expect(startNextSeason).not.toHaveBeenCalled();
  });

  it("auto-starts the next season with no Imperial Ward grant once the window elapses without an endorsement", async () => {
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary(),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();
    expect(startNextSeason).toHaveBeenCalledWith(false, undefined, undefined);
  });

  it("auto-starts and grants Imperial Ward charges to the endorsed target once the window elapses", async () => {
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });
    const endorsementStore = new InMemoryGalaxyEndorsementStore();
    await endorsementStore.upsert({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-1" });
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary(),
      startNextSeason,
      endorsementStore,
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();

    expect(startNextSeason).toHaveBeenCalledWith(false, { playerId: "target-1", charges: 3 }, undefined);
    const record = await endorsementStore.getByEndedSeasonId("season-1");
    expect(record?.appliedAt).toBeDefined();
  });

  it("does not re-apply an already-applied endorsement on a later tick", async () => {
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });
    const endorsementStore = new InMemoryGalaxyEndorsementStore();
    await endorsementStore.upsert({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-1" });
    await endorsementStore.markApplied("season-1");
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary(),
      startNextSeason,
      endorsementStore,
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();

    expect(startNextSeason).toHaveBeenCalledWith(false, undefined, undefined);
  });

  it("guards against overlapping ticks while a startNextSeason call is in flight", async () => {
    let resolveStart: (() => void) | undefined;
    const startNextSeason = vi.fn(
      () =>
        new Promise<{ seasonId: string }>((resolve) => {
          resolveStart = () => resolve({ seasonId: "season-2" });
        })
    );
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary(),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();
    resolveStart?.();

    expect(startNextSeason).toHaveBeenCalledTimes(1);
  });

  it("reports errors via onError instead of throwing", async () => {
    const onError = vi.fn();
    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => {
        throw new Error("boom");
      },
      startNextSeason: vi.fn(),
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      intervalMs: 5,
      onError
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("Defense Campaign auto-scheduling", () => {
  it("applies a pending ownership transfer and seeds Stability when a Defense Campaign season just ended", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-conqueror", playerId: "emperor-1" });
    const galaxyDefenseCampaignStore = new InMemoryGalaxyDefenseCampaignStore();
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });

    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary({ defenseCampaignTargetSeasonId: "season-original" }),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      galaxyDefenseCampaignStore,
      galaxyEconomyStore,
      authBindingStore,
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();

    const transfer = await galaxyDefenseCampaignStore.getTransferForSeasonId("season-original");
    expect(transfer).toMatchObject({ originalSeasonId: "season-original", currentOwnerAuthUid: "uid-conqueror", wonViaSeasonId: "season-1" });
    await expect(galaxyEconomyStore.getStability("uid-conqueror", "season-original")).resolves.toMatchObject({ stability: 100 });
  });

  it("does not pick a Defense Campaign target for a reserved Frontier slot even with a non-empty queue", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    const galaxyDefenseCampaignStore = new InMemoryGalaxyDefenseCampaignStore();
    await galaxyDefenseCampaignStore.enqueueContested({ targetSeasonId: "season-contested", targetAuthUid: "uid-x", queuedAt: 0 });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });

    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary({ seasonSequence: 2 }),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      galaxyDefenseCampaignStore,
      galaxyEconomyStore,
      authBindingStore,
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();

    expect(startNextSeason).toHaveBeenCalledWith(false, undefined, undefined);
    await expect(galaxyDefenseCampaignStore.getQueueLength()).resolves.toBe(1);
  });

  it("picks the oldest contested target for a non-reserved slot", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    const galaxyDefenseCampaignStore = new InMemoryGalaxyDefenseCampaignStore();
    await galaxyDefenseCampaignStore.enqueueContested({ targetSeasonId: "season-contested", targetAuthUid: "uid-x", queuedAt: 0 });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const startNextSeason = vi.fn().mockResolvedValue({ seasonId: "season-2" });

    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary({ seasonSequence: 1 }),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      galaxyDefenseCampaignStore,
      galaxyEconomyStore,
      authBindingStore,
      now: () => 61 * 60_000,
      intervalMs: 5
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();

    expect(startNextSeason).toHaveBeenCalledWith(false, undefined, "season-contested");
    await expect(galaxyDefenseCampaignStore.getQueueLength()).resolves.toBe(0);
  });

  it("re-enqueues the exact popped entry, targetAuthUid included, if startNextSeason fails", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    const galaxyDefenseCampaignStore = new InMemoryGalaxyDefenseCampaignStore();
    await galaxyDefenseCampaignStore.enqueueContested({ targetSeasonId: "season-contested", targetAuthUid: "uid-x", queuedAt: 0 });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const startNextSeason = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();

    const timer = startImperialWardAutoStartTimer({
      getCurrentSeasonSummary: async () => endedSummary({ seasonSequence: 1 }),
      startNextSeason,
      endorsementStore: new InMemoryGalaxyEndorsementStore(),
      galaxyDefenseCampaignStore,
      galaxyEconomyStore,
      authBindingStore,
      now: () => 61 * 60_000,
      intervalMs: 5,
      onError
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.stop();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    await expect(galaxyDefenseCampaignStore.popOldestContested()).resolves.toMatchObject({ targetSeasonId: "season-contested", targetAuthUid: "uid-x" });
  });
});
