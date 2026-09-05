import { describe, expect, it, vi } from "vitest";

import { InMemoryGalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";
import { InMemoryGalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js";
import { startGalaxyFleetScheduler } from "./galaxy-fleet-scheduler.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startGalaxyFleetScheduler", () => {
  it("resolves an arrived TRAVELING order, applying damage to the target's Stability", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxyBattleLogStore = new InMemoryGalaxyBattleLogStore();
    await galaxyEconomyStore.ensureStability({ authUid: "uid-defender", seasonId: "season-1", tier: "PLANET" });

    const order = await galaxyFleetStore.createOrder({
      ownerAuthUid: "uid-attacker",
      targetAuthUid: "uid-defender",
      targetSeasonId: "season-1",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });

    const scheduler = startGalaxyFleetScheduler({ galaxyFleetStore, galaxyEconomyStore, galaxyBattleLogStore, now: () => 2_000, pollIntervalMs: 60_000 });
    scheduler.stop();
    await flush();

    await expect(galaxyEconomyStore.getStability("uid-defender", "season-1")).resolves.toMatchObject({ stability: 0 });
    await expect(galaxyFleetStore.getOrder(order.id)).resolves.toMatchObject({ status: "RESOLVED", outcome: { netDamage: 200 } });

    const log = await galaxyBattleLogStore.listRecent(10);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ attackerAuthUid: "uid-attacker", defenderAuthUid: "uid-defender", netDamage: 200 });
  });

  it("Garrison absorbs damage before Stability takes any", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxyBattleLogStore = new InMemoryGalaxyBattleLogStore();
    await galaxyEconomyStore.ensureStability({ authUid: "uid-defender", seasonId: "season-1", tier: "PLANET" });
    await galaxyEconomyStore.addGarrison("uid-defender", "season-1", 150);

    await galaxyFleetStore.createOrder({
      ownerAuthUid: "uid-attacker",
      targetAuthUid: "uid-defender",
      targetSeasonId: "season-1",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });

    const scheduler = startGalaxyFleetScheduler({ galaxyFleetStore, galaxyEconomyStore, galaxyBattleLogStore, now: () => 2_000, pollIntervalMs: 60_000 });
    scheduler.stop();
    await flush();

    await expect(galaxyEconomyStore.getStability("uid-defender", "season-1")).resolves.toMatchObject({ stability: 50, garrison: 150 });
  });

  it("a Scout-only order reveals Garrison without changing Stability", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxyBattleLogStore = new InMemoryGalaxyBattleLogStore();
    await galaxyEconomyStore.ensureStability({ authUid: "uid-defender", seasonId: "season-1", tier: "PLANET" });
    await galaxyEconomyStore.addGarrison("uid-defender", "season-1", 75);

    const order = await galaxyFleetStore.createOrder({
      ownerAuthUid: "uid-attacker",
      targetAuthUid: "uid-defender",
      targetSeasonId: "season-1",
      composition: { SCOUT: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });

    const scheduler = startGalaxyFleetScheduler({ galaxyFleetStore, galaxyEconomyStore, galaxyBattleLogStore, now: () => 2_000, pollIntervalMs: 60_000 });
    scheduler.stop();
    await flush();

    await expect(galaxyEconomyStore.getStability("uid-defender", "season-1")).resolves.toMatchObject({ stability: 100, garrison: 75 });
    await expect(galaxyFleetStore.getOrder(order.id)).resolves.toMatchObject({ outcome: { reconOnly: true, revealedGarrison: 75 } });
  });

  it("a raid that breaks a Sector's Stability to 0 resets its Garrison and enqueues a Defense Campaign", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxyBattleLogStore = new InMemoryGalaxyBattleLogStore();
    const galaxyDefenseCampaignStore = new InMemoryGalaxyDefenseCampaignStore();
    await galaxyEconomyStore.ensureStability({ authUid: "uid-defender", seasonId: "season-1", tier: "PLANET" });
    await galaxyEconomyStore.addGarrison("uid-defender", "season-1", 50);

    await galaxyFleetStore.createOrder({
      ownerAuthUid: "uid-attacker",
      targetAuthUid: "uid-defender",
      targetSeasonId: "season-1",
      composition: { DREADNOUGHT: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });

    const scheduler = startGalaxyFleetScheduler({
      galaxyFleetStore,
      galaxyEconomyStore,
      galaxyBattleLogStore,
      galaxyDefenseCampaignStore,
      now: () => 2_000,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await flush();

    await expect(galaxyEconomyStore.getStability("uid-defender", "season-1")).resolves.toMatchObject({ stability: 0, garrison: 0 });
    await expect(galaxyDefenseCampaignStore.getQueueLength()).resolves.toBe(1);
    await expect(galaxyDefenseCampaignStore.popOldestContested()).resolves.toMatchObject({ targetSeasonId: "season-1", targetAuthUid: "uid-defender" });
  });

  it("resolves an order against a target that no longer has a Stability row without throwing", async () => {
    const galaxyFleetStore = new InMemoryGalaxyFleetStore();
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxyBattleLogStore = new InMemoryGalaxyBattleLogStore();
    const onError = vi.fn();

    const order = await galaxyFleetStore.createOrder({
      ownerAuthUid: "uid-attacker",
      targetAuthUid: "uid-gone",
      targetSeasonId: "season-gone",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });

    const scheduler = startGalaxyFleetScheduler({ galaxyFleetStore, galaxyEconomyStore, galaxyBattleLogStore, now: () => 2_000, pollIntervalMs: 60_000, onError });
    scheduler.stop();
    await flush();

    expect(onError).not.toHaveBeenCalled();
    await expect(galaxyFleetStore.getOrder(order.id)).resolves.toMatchObject({ status: "RESOLVED" });
  });
});
