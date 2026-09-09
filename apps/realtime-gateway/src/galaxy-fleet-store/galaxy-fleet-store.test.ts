import { describe, expect, it } from "vitest";
import { InMemoryGalaxyFleetStore } from "./galaxy-fleet-store.js";

describe("InMemoryGalaxyFleetStore blueprints", () => {
  it("saves and lists a blueprint, newest first", async () => {
    const store = new InMemoryGalaxyFleetStore();
    await store.saveBlueprint({ ownerAuthUid: "uid-1", name: "First Strike", composition: { RAIDER: 2 }, weaponEmphasis: "KINETIC", createdAt: 1 });
    await store.saveBlueprint({ ownerAuthUid: "uid-1", name: "Second Strike", composition: { BATTLELINE: 1 }, weaponEmphasis: "ENERGY", createdAt: 2 });

    const listed = await store.listBlueprints("uid-1");
    expect(listed.map((b) => b.name)).toEqual(["Second Strike", "First Strike"]);
  });

  it("only lists an owner's own blueprints", async () => {
    const store = new InMemoryGalaxyFleetStore();
    await store.saveBlueprint({ ownerAuthUid: "uid-1", name: "Mine", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", createdAt: 1 });
    await store.saveBlueprint({ ownerAuthUid: "uid-2", name: "Theirs", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", createdAt: 1 });

    const listed = await store.listBlueprints("uid-1");
    expect(listed.map((b) => b.name)).toEqual(["Mine"]);
  });

  it("deleteBlueprint only removes the owner's own blueprint", async () => {
    const store = new InMemoryGalaxyFleetStore();
    const blueprint = await store.saveBlueprint({ ownerAuthUid: "uid-1", name: "Mine", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", createdAt: 1 });

    await store.deleteBlueprint(blueprint.id, "uid-2");
    expect(await store.listBlueprints("uid-1")).toHaveLength(1);

    await store.deleteBlueprint(blueprint.id, "uid-1");
    expect(await store.listBlueprints("uid-1")).toHaveLength(0);
  });
});

describe("InMemoryGalaxyFleetStore orders", () => {
  it("creates a TRAVELING order and reads it back", async () => {
    const store = new InMemoryGalaxyFleetStore();
    const order = await store.createOrder({
      ownerAuthUid: "uid-1",
      targetAuthUid: "uid-2",
      targetSeasonId: "season-1",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 1_000,
      arrivesAt: 2_000
    });
    expect(order.status).toBe("TRAVELING");
    await expect(store.getOrder(order.id)).resolves.toMatchObject({ status: "TRAVELING" });
  });

  it("getArrivedTravelingOrders only returns TRAVELING orders whose arrivesAt has passed", async () => {
    const store = new InMemoryGalaxyFleetStore();
    const arrived = await store.createOrder({
      ownerAuthUid: "uid-1",
      targetAuthUid: "uid-2",
      targetSeasonId: "season-1",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });
    await store.createOrder({
      ownerAuthUid: "uid-1",
      targetAuthUid: "uid-2",
      targetSeasonId: "season-2",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 5_000
    });

    const due = await store.getArrivedTravelingOrders(2_000);
    expect(due.map((o) => o.id)).toEqual([arrived.id]);
  });

  it("getArrivedTravelingOrders excludes an already-resolved order", async () => {
    const store = new InMemoryGalaxyFleetStore();
    const order = await store.createOrder({
      ownerAuthUid: "uid-1",
      targetAuthUid: "uid-2",
      targetSeasonId: "season-1",
      composition: { BATTLELINE: 1 },
      weaponEmphasis: "KINETIC",
      sentAt: 0,
      arrivesAt: 1_000
    });
    await store.resolveOrder(order.id, {
      resolvedAt: 2_000,
      outcome: { reconOnly: false, damageDealt: 200, garrisonAbsorbed: 0, netDamage: 200, stabilityBefore: 100, stabilityAfter: 0 }
    });

    await expect(store.getArrivedTravelingOrders(2_000)).resolves.toEqual([]);
    await expect(store.getOrder(order.id)).resolves.toMatchObject({ status: "RESOLVED", outcome: { netDamage: 200 } });
  });

  it("listOrdersForOwner only returns that owner's orders, newest first", async () => {
    const store = new InMemoryGalaxyFleetStore();
    await store.createOrder({ ownerAuthUid: "uid-1", targetAuthUid: "uid-2", targetSeasonId: "season-1", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 2 });
    await store.createOrder({ ownerAuthUid: "uid-1", targetAuthUid: "uid-2", targetSeasonId: "season-2", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 2, arrivesAt: 3 });
    await store.createOrder({ ownerAuthUid: "uid-3", targetAuthUid: "uid-2", targetSeasonId: "season-3", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 2 });

    const listed = await store.listOrdersForOwner("uid-1");
    expect(listed.map((o) => o.targetSeasonId)).toEqual(["season-2", "season-1"]);
  });

  it("listIncomingOrders returns TRAVELING RAID orders aimed at the target, earliest-arriving first", async () => {
    const store = new InMemoryGalaxyFleetStore();
    await store.createOrder({ ownerAuthUid: "uid-attacker", targetAuthUid: "uid-defender", targetSeasonId: "season-1", orderKind: "RAID", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 3000 });
    await store.createOrder({ ownerAuthUid: "uid-attacker", targetAuthUid: "uid-defender", targetSeasonId: "season-2", orderKind: "RAID", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 1000 });
    // Not incoming: someone else's raid, a raid against a different target, and this defender's own outgoing garrison.
    await store.createOrder({ ownerAuthUid: "uid-other", targetAuthUid: "uid-someone-else", targetSeasonId: "season-3", orderKind: "RAID", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 2000 });
    await store.createOrder({ ownerAuthUid: "uid-defender", targetAuthUid: "uid-defender", targetSeasonId: "season-4", orderKind: "GARRISON", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 2000 });

    const incoming = await store.listIncomingOrders("uid-defender");
    expect(incoming.map((o) => o.targetSeasonId)).toEqual(["season-2", "season-1"]);
  });

  it("listIncomingOrders treats a pre-orderKind-field order (undefined) as RAID", async () => {
    const store = new InMemoryGalaxyFleetStore();
    await store.createOrder({ ownerAuthUid: "uid-attacker", targetAuthUid: "uid-defender", targetSeasonId: "season-1", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 1000 });
    const incoming = await store.listIncomingOrders("uid-defender");
    expect(incoming).toHaveLength(1);
  });

  it("listIncomingOrders excludes a RESOLVED order", async () => {
    const store = new InMemoryGalaxyFleetStore();
    const order = await store.createOrder({ ownerAuthUid: "uid-attacker", targetAuthUid: "uid-defender", targetSeasonId: "season-1", orderKind: "RAID", composition: { RAIDER: 1 }, weaponEmphasis: "KINETIC", sentAt: 1, arrivesAt: 1000 });
    await store.resolveOrder(order.id, { resolvedAt: 2000, outcome: { reconOnly: false, damageDealt: 50, garrisonAbsorbed: 0, netDamage: 50, stabilityBefore: 100, stabilityAfter: 50 } });
    await expect(store.listIncomingOrders("uid-defender")).resolves.toEqual([]);
  });
});
