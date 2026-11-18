import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { HouseCharge } from "@border-empires/shared";
import { dealHouseCharges } from "./house-charge-dealing.js";
import { houseChargeExpansionObjective } from "./house-charge-ai-objective.js";
import { houseChargeStanding } from "./house-charge-held.js";
import { runHouseChargesPass } from "./house-charges-ticker.js";
import { houseChargesWorldFor } from "./house-charges-world.js";
import { HARROWMERE, HOME, VELL, buildChargeWorld, garrisonKeys, makeChargePlayer } from "./house-charges.test-helpers.js";

// The Writ of Correction and Three Metropolises charges that replace the
// one-town Seat (docs/house-charges-plan.md). The shared test world is
// extended with a third town, Ostry (12,25), and a rival House "p2" landed at
// (36,27), 28 tiles from p1's landing site.
const OSTRY = "12,25";
const RIVAL_AFC = "36,27";

const world = (): Map<string, DomainTileState> => {
  const tiles = buildChargeWorld();
  tiles.set(OSTRY, { ...tiles.get(OSTRY)!, town: { type: "MARKET", populationTier: "TOWN", name: "Ostry" } });
  tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p2", ownershipState: "SETTLED", afc: { ownerId: "p2", status: "active", landedAt: 1 } });
  return tiles;
};

const dealFor = (tiles: Map<string, DomainTileState>, holders: (key: string) => number = () => 0) =>
  dealHouseCharges({
    world: houseChargesWorldFor(tiles),
    tiles,
    playerId: "p1",
    home: HOME,
    worldSeed: 7,
    holders,
    now: 1_000,
    rivalLandingSites: [{ x: 36, y: 27 }],
    rivalLandings: [{ playerId: "p2", name: "Varn", x: 36, y: 27 }]
  });

const correction: HouseCharge = { id: "CORRECTION:x", kind: "CORRECTION", targets: [{ key: "house:p2", name: "Varn", x: 36, y: 27 }], searchCircle: { x: 36, y: 27, radius: 9 }, rarity: "RARE", renown: 2 };
const metropolis = (islandId: string): HouseCharge => ({ id: "METROPOLIS:x", kind: "METROPOLIS", targets: [{ key: `metropolis:${islandId}`, name: "Main", x: 16, y: 18 }], searchCircle: { x: 16, y: 18, radius: 9 }, rarity: "COMMON", renown: 2 });

const standing = (charge: HouseCharge, tiles: Map<string, DomainTileState>, playerId = "p1") =>
  houseChargeStanding(charge, { world: houseChargesWorldFor(tiles), tiles, players: new Map(), playerId });

describe("dealing the replacement charges", () => {
  it("never deals a Seat, and can deal a Correction against a rival House and Three Metropolises on a landmass", () => {
    const kinds = new Set<string>();
    for (const holdersOf of [() => 0, (key: string) => (key.startsWith("relic:") || key.startsWith("town:") ? 99 : 0)]) {
      for (const charge of dealFor(world(), holdersOf)?.offered ?? []) kinds.add(charge.kind);
    }
    expect(kinds.has("SEAT")).toBe(false);
    expect(kinds).toContain("CORRECTION");
    expect(kinds).toContain("METROPOLIS");
  });

  it("names the rival House and points at its landing site", () => {
    const dealt = dealFor(world(), (key) => (key.startsWith("house:") ? 0 : 99))!;
    const writ = dealt.offered.find((charge) => charge.kind === "CORRECTION")!;
    expect(writ.targets).toEqual([{ key: "house:p2", name: "Varn", x: 36, y: 27 }]);
    expect(writ.rarity).toBe("RARE");
  });

  it("deals no Correction once five Houses hold that rival, and no Metropolis charge on a landmass with fewer than three towns", () => {
    const capped = dealFor(world(), (key) => (key === "house:p2" ? 5 : 0));
    expect(capped?.offered.some((charge) => charge.kind === "CORRECTION")).toBe(false);
    const twoTowns = buildChargeWorld();
    const dealt = dealHouseCharges({ world: houseChargesWorldFor(twoTowns), tiles: twoTowns, playerId: "p1", home: HOME, worldSeed: 7, holders: () => 0, now: 1_000 });
    expect(dealt?.offered.some((charge) => charge.kind === "METROPOLIS")).toBe(false);
  });
});

describe("Writ of Correction held state", () => {
  it("is held while the House owns any AFC the rival founded, including one the rival built later", () => {
    const tiles = world();
    expect(standing(correction, tiles).complete).toBe(false);
    // p1 captures p2's landing AFC: the capture keeps the founder.
    tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p1", afc: { ownerId: "p1", status: "active", capturedAt: 50, foundedBy: "p2" } });
    expect(standing(correction, tiles)).toMatchObject({ complete: true, size: 1 });
    // p2 retakes it; p1 then takes a second AFC p2 built elsewhere.
    tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p2", afc: { ownerId: "p2", status: "active", capturedAt: 60, foundedBy: "p2" } });
    tiles.set("5,5", { ...tiles.get("5,5")!, ownerId: "p1", ownershipState: "SETTLED", afc: { ownerId: "p1", status: "active", capturedAt: 70, foundedBy: "p2" } });
    expect(standing(correction, tiles)).toMatchObject({ complete: true, size: 1 });
  });

  it("does not count the House's own AFC, a frontier-held AFC, or an AFC of unknown founder", () => {
    const tiles = world();
    tiles.set("5,5", { ...tiles.get("5,5")!, ownerId: "p1", ownershipState: "FRONTIER", afc: { ownerId: "p1", status: "active", capturedAt: 70, foundedBy: "p2" } });
    tiles.set("6,6", { ...tiles.get("6,6")!, ownerId: "p1", ownershipState: "SETTLED", afc: { ownerId: "p1", status: "active", capturedAt: 70 } });
    expect(standing(correction, tiles).complete).toBe(false);
  });
});

describe("Three Metropolises held state", () => {
  it("needs three garrisoned Metropolises on the named landmass", () => {
    const tiles = world();
    const islandId = houseChargesWorldFor(tiles).islands.islandAt(VELL.split(",").map(Number)[0]!, 15)!.id;
    const charge = metropolis(islandId);
    garrisonKeys(tiles, "p1", [VELL, HARROWMERE, OSTRY]);
    expect(standing(charge, tiles)).toMatchObject({ complete: false, size: 0 });
    for (const key of [VELL, HARROWMERE]) tiles.set(key, { ...tiles.get(key)!, town: { ...tiles.get(key)!.town!, populationTier: "METROPOLIS" } });
    expect(standing(charge, tiles)).toMatchObject({ complete: false, size: 2 });
    tiles.set(OSTRY, { ...tiles.get(OSTRY)!, town: { ...tiles.get(OSTRY)!.town!, populationTier: "METROPOLIS" } });
    expect(standing(charge, tiles)).toMatchObject({ complete: true, size: 3 });
  });

  it("sends an AI House to the landmass's towns until it holds three, then stops pulling expansion", () => {
    const tiles = world();
    const islandId = houseChargesWorldFor(tiles).islands.islandAt(8, 15)!.id;
    const charge = metropolis(islandId);
    const player = { id: "p1", houseCharges: { dealtAt: 0, offered: [charge], keptIds: [charge.id] } };
    expect(houseChargeExpansionObjective(player, tiles)).toMatchObject({ kind: "neutral_value" });
    garrisonKeys(tiles, "p1", [VELL, HARROWMERE, OSTRY]);
    expect(houseChargeExpansionObjective(player, tiles)).toBeUndefined();
  });
});

describe("ticker pass", () => {
  it("records a Correction completing when the House captures the rival's AFC", () => {
    const tiles = world();
    const players = new Map([["p1", makeChargePlayer("p1", { name: "Sigrid" })], ["p2", makeChargePlayer("p2", { name: "Varn" })]]);
    players.get("p1")!.houseCharges = { dealtAt: 0, offered: [correction], keptIds: [correction.id] };
    runHouseChargesPass(tiles, players, 1_000, { deal: false });
    expect(players.get("p1")!.houseCharges!.completeSince).toBeUndefined();
    tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p1", afc: { ownerId: "p1", status: "active", capturedAt: 900, foundedBy: "p2" } });
    runHouseChargesPass(tiles, players, 2_000, { deal: false });
    expect(players.get("p1")!.houseCharges!.completeSince).toEqual({ [correction.id]: 2_000 });
  });
});
