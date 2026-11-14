import { describe, expect, it } from "vitest";
import { HOUSE_CHARGE_TARGET_CAP, keptHouseCharges, type HouseCharge } from "@border-empires/shared";
import { buildBiomeRegionRegistry } from "./biome-region-registry.js";
import { dealHouseCharges } from "./house-charge-dealing.js";
import { charterRoadLength, houseChargeStanding } from "./house-charge-held.js";
import { houseChargesAtCrowning } from "./house-charges-crowning.js";
import { runHouseChargesPass } from "./house-charges-ticker.js";
import { houseChargesWorldFor } from "./house-charges-world.js";
import {
  HARROWMERE,
  HOME,
  RELIC,
  VELL,
  buildChargeWorld,
  charterRoadKeys,
  garrisonKeys,
  makeChargePlayer
} from "./house-charges.test-helpers.js";

const deal = (tiles = buildChargeWorld(), holders: (key: string) => number = () => 0) =>
  dealHouseCharges({ world: houseChargesWorldFor(tiles), tiles, playerId: "p1", home: HOME, worldSeed: 42, holders, now: 1_000 });

const chargeOfKind = (kind: HouseCharge["kind"], tiles = buildChargeWorld()): HouseCharge => {
  const world = houseChargesWorldFor(tiles);
  const charges = [...world.towns, ...world.relics].length > 0 ? deal(tiles)!.offered : [];
  const found = charges.find((charge) => charge.kind === kind);
  if (found) return found;
  // Not every kind makes the 3-card offer; build the missing one directly.
  if (kind === "DESERT") {
    const region = world.regions.regions[0]!;
    return { id: "DESERT:x", kind, targets: [{ key: `region:${region.id}`, name: "Reach", ...region.centre }], searchCircle: { x: 0, y: 0, radius: 9 }, rarity: "COMMON", renown: 1 };
  }
  if (kind === "SEAT") return { id: "SEAT:x", kind, targets: [{ key: `town:${VELL}`, name: "Vell", x: 8, y: 15 }], searchCircle: { x: 0, y: 0, radius: 9 }, rarity: "COMMON", renown: 1 };
  return { id: "CHARTER:x", kind: "CHARTER", targets: [{ key: `town:${VELL}`, name: "Vell", x: 8, y: 15 }, { key: `town:${HARROWMERE}`, name: "Harrowmere", x: 30, y: 20 }], searchCircle: { x: 0, y: 0, radius: 9 }, rarity: "COMMON", renown: 1 };
};

describe("biome regions", () => {
  it("keeps a desert patch inside the size band and names it", () => {
    const tiles = buildChargeWorld();
    const registry = buildBiomeRegionRegistry(tiles);
    expect(registry.regions).toHaveLength(1);
    expect(registry.regions[0]).toMatchObject({ id: "25,2", kind: "DESERT" });
    expect(registry.regions[0]!.cells).toHaveLength(40);
    expect(houseChargesWorldFor(tiles).regionName(registry.regions[0]!)).toMatch(/\w/);
  });

  it("drops a patch smaller than the band", () => {
    const tiles = buildChargeWorld();
    for (const [key, tile] of tiles) if (tile.landBiome === "SAND" && tile.y > 3) tiles.set(key, { ...tile, landBiome: "GRASS" });
    expect(buildBiomeRegionRegistry(tiles).regions).toHaveLength(0);
  });
});

describe("dealing", () => {
  it("offers three charges, always including the relic, and keeps two", () => {
    const state = deal()!;
    expect(state.offered).toHaveLength(3);
    expect(state.offered[0]).toMatchObject({ kind: "RELIC", rarity: "MYTHIC", renown: 4, relicType: "FOUNDRY_HEART" });
    expect(state.keptIds).toEqual(state.offered.slice(0, 2).map((charge) => charge.id));
    for (const charge of state.offered) {
      const { x, y, radius } = charge.searchCircle;
      const target = charge.targets[0]!;
      expect(Math.abs(target.x - x) + Math.abs(target.y - y)).toBeLessThanOrEqual(radius * 2);
    }
  });

  it("is deterministic for the same seed, player and holders", () => {
    expect(deal()).toEqual(deal());
  });

  it("respects the per-target holder cap", () => {
    const state = deal(buildChargeWorld(), (key) => (key === `relic:${RELIC}` ? HOUSE_CHARGE_TARGET_CAP : 0))!;
    expect(state.offered.some((charge) => charge.kind === "RELIC")).toBe(false);
  });

  it("offers nothing a rival already owns as a town", () => {
    const tiles = buildChargeWorld();
    garrisonKeys(tiles, "rival", [VELL, HARROWMERE]);
    const state = deal(tiles)!;
    expect(state.offered.some((charge) => charge.kind === "CHARTER" || charge.kind === "SEAT")).toBe(false);
  });
});

describe("held state", () => {
  const context = (tiles: ReturnType<typeof buildChargeWorld>) => ({ world: houseChargesWorldFor(tiles), tiles, players: new Map(), playerId: "p1" });

  it("completes a Charter only while an unbroken garrisoned road joins both towns", () => {
    const tiles = buildChargeWorld();
    garrisonKeys(tiles, "p1", charterRoadKeys());
    const charge = chargeOfKind("CHARTER", tiles);
    expect(charterRoadLength(tiles, houseChargesWorldFor(tiles), "p1", VELL, HARROWMERE)).toBe(28);
    expect(houseChargeStanding(charge, context(tiles))).toEqual({ complete: true, size: 28 });
    tiles.set("20,15", { ...tiles.get("20,15")!, ownerId: "rival" });
    expect(houseChargeStanding(charge, context(tiles)).complete).toBe(false);
  });

  it("completes a desert garrison at 75% of its land", () => {
    const tiles = buildChargeWorld();
    const desert = [...tiles.values()].filter((tile) => tile.landBiome === "SAND").map((tile) => `${tile.x},${tile.y}`);
    const charge = chargeOfKind("DESERT", tiles);
    garrisonKeys(tiles, "p1", desert.slice(0, 29));
    expect(houseChargeStanding(charge, context(tiles))).toEqual({ complete: false, size: 29 });
    garrisonKeys(tiles, "p1", desert.slice(29, 30));
    expect(houseChargeStanding(charge, context(tiles))).toEqual({ complete: true, size: 30 });
  });

  it("completes a Seat once the town is a garrisoned City", () => {
    const tiles = buildChargeWorld();
    const charge = chargeOfKind("SEAT", tiles);
    const seatKey = charge.targets[0]!.key.replace("town:", "");
    garrisonKeys(tiles, "p1", [seatKey]);
    expect(houseChargeStanding(charge, context(tiles)).complete).toBe(false);
    const seat = tiles.get(seatKey)!;
    tiles.set(seatKey, { ...seat, town: { ...seat.town!, populationTier: "CITY" } });
    expect(houseChargeStanding(charge, context(tiles))).toEqual({ complete: true, size: 3 });
  });
});

describe("ticker pass and crowning", () => {
  it("deals to landed Houses only, tracks completion and records it at crowning", () => {
    const tiles = buildChargeWorld();
    const players = new Map([
      ["p1", makeChargePlayer("p1", { name: "House Alden" })],
      ["p2", makeChargePlayer("p2")],
      ["barbarian-1", makeChargePlayer("barbarian-1")]
    ]);
    expect(runHouseChargesPass(tiles, players, 1_000)).toEqual(["p1"]);
    expect(players.get("p2")!.houseCharges).toBeUndefined();
    expect(players.get("barbarian-1")!.houseCharges).toBeUndefined();

    const p1 = players.get("p1")!;
    const relic = keptHouseCharges(p1.houseCharges!).find((charge) => charge.kind === "RELIC")!;
    garrisonKeys(tiles, "p1", [RELIC]);
    expect(runHouseChargesPass(tiles, players, 2_000)).toEqual(["p1"]);
    expect(p1.houseCharges!.completeSince).toEqual({ [relic.id]: 2_000 });
    // Still held later: completeSince keeps the first moment.
    runHouseChargesPass(tiles, players, 3_000);
    expect(p1.houseCharges!.completeSince).toEqual({ [relic.id]: 2_000 });

    const results = houseChargesAtCrowning([{ id: "p1", name: "House Alden", houseCharges: p1.houseCharges! }], 2_000 + 5 * 3_600_000 + 1);
    expect(results).toHaveLength(1);
    expect(results[0]!.playerName).toBe("House Alden");
    const relicResult = results[0]!.charges.find((charge) => charge.id === relic.id)!;
    expect(relicResult).toMatchObject({ held: true, hoursHeld: 5, size: 1, title: "A Concordance installation", rarity: "MYTHIC" });
    expect(results[0]!.charges.filter((charge) => charge.id !== relic.id).every((charge) => !charge.held && charge.hoursHeld === 0)).toBe(true);

    // Losing it clears completeSince and records when, for the private loss warning.
    tiles.set(RELIC, { ...tiles.get(RELIC)!, ownerId: "rival" });
    runHouseChargesPass(tiles, players, 4_000);
    expect(p1.houseCharges!.completeSince).toBeUndefined();
    expect(p1.houseCharges!.lostAt).toEqual({ [relic.id]: 4_000 });
    runHouseChargesPass(tiles, players, 5_000);
    expect(p1.houseCharges!.lostAt).toEqual({ [relic.id]: 4_000 });
    // Retaking it clears the loss.
    garrisonKeys(tiles, "p1", [RELIC]);
    runHouseChargesPass(tiles, players, 6_000);
    expect(p1.houseCharges!.lostAt).toBeUndefined();
  });

  it("gives a landing with no qualifying target an empty deal so it is not retried", () => {
    const tiles = new Map([["5,5", { x: 5, y: 5, terrain: "LAND" as const, ownerId: "p1", ownershipState: "SETTLED" as const, afc: { ownerId: "p1", status: "active" as const } }]]);
    const players = new Map([["p1", makeChargePlayer("p1")]]);
    runHouseChargesPass(tiles, players, 1_000);
    expect(players.get("p1")!.houseCharges).toEqual({ dealtAt: 1_000, offered: [], keptIds: [], sizes: {} });
  });
});

describe("HOUSE_CHARGES view", () => {
  it("hides a relic's position until its beacon is detected, and its type until it is garrisoned", async () => {
    const { houseChargesPayloadFor } = await import("./house-charges-view.js");
    const tiles = buildChargeWorld();
    const players = new Map([["p1", makeChargePlayer("p1")]]);
    runHouseChargesPass(tiles, players, 1_000);
    // The landing site (20,15) is itself inside the beacon radius; take it away so only later garrisons count.
    tiles.set(`${HOME.x},${HOME.y}`, { ...tiles.get(`${HOME.x},${HOME.y}`)!, ownerId: undefined, ownershipState: undefined });
    const relicView = () => houseChargesPayloadFor(players.get("p1")!, tiles)!.charges.find((charge) => charge.kind === "RELIC")!;
    expect(relicView().targets).toEqual([]);
    expect(relicView().relicType).toBeUndefined();
    expect(relicView().title).toBe("A Concordance installation");

    garrisonKeys(tiles, "p1", ["20,20"]); // 5 tiles from the relic, inside the 12-tile beacon radius
    expect(relicView().targets).toEqual([expect.objectContaining({ x: 20, y: 25 })]);
    expect(relicView().relicType).toBeUndefined();

    garrisonKeys(tiles, "p1", [RELIC]);
    expect(relicView().relicType).toBe("FOUNDRY_HEART");
  });
});

describe("HOUSE_CHARGES area tiles", () => {
  it("lists a desert region's tiles so the client can shade it", async () => {
    const { houseChargesPayloadFor } = await import("./house-charges-view.js");
    const tiles = buildChargeWorld();
    const players = new Map([["p1", makeChargePlayer("p1")]]);
    runHouseChargesPass(tiles, players, 1_000);
    const player = players.get("p1")!;
    const desert = chargeOfKind("DESERT", tiles);
    player.houseCharges = { ...player.houseCharges!, offered: [...player.houseCharges!.offered.filter((charge) => charge.kind !== "DESERT"), desert] };
    const view = houseChargesPayloadFor(player, tiles)!.charges.find((charge) => charge.kind === "DESERT")!;
    expect(view.areaTileKeys).toHaveLength(40);
    expect(view.areaTileKeys).toContain("25,2");
    expect(houseChargesPayloadFor(player, tiles)!.charges.find((charge) => charge.kind === "RELIC")!.areaTileKeys).toBeUndefined();
  });
});
