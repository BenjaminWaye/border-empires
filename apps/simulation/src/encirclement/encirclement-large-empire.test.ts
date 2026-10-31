/**
 * Encirclement on large empires. The affected-region walk used to cross every
 * tile the player owned (settled included), so the 2,000 cap combat passes
 * was blown by any empire of ~1,800+ connected tiles and encirclement silently
 * did nothing: losing a counter-attacked origin left the frontier behind it
 * standing with no supply.
 */
import { describe, expect, it } from "vitest";
import { computeEncirclementDeltas } from "./encirclement.js";

type TileStub = { ownerId?: string; ownershipState?: string; dockId?: string; frontierDecayAt?: number; frontierDecayKind?: "ENCIRCLEMENT" };

const COMBAT_BFS_CAP = 2_000;

/** A `size`×`size` settled block for player-1 at (100,100), with a lost origin and a stranded frontier tile east of it. */
const lostOriginScenario = (size: number) => {
  const tiles = new Map<string, TileStub>();
  for (let x = 100; x < 100 + size; x += 1) {
    for (let y = 100; y < 100 + size; y += 1) tiles.set(`${x},${y}`, { ownerId: "player-1", ownershipState: "SETTLED" });
  }
  const originX = 100 + size;
  // The origin player-1 attacked from, now taken by the defender's counter.
  tiles.set(`${originX},100`, { ownerId: "player-2", ownershipState: "FRONTIER" });
  tiles.set(`${originX},101`, { ownerId: "player-2", ownershipState: "SETTLED" });
  tiles.set(`${originX},99`, { ownerId: "player-2", ownershipState: "SETTLED" });
  tiles.set(`${originX + 1},101`, { ownerId: "player-2", ownershipState: "SETTLED" }); // the garrison
  // Frontier tile further out whose only link home was the origin.
  const strandedKey = `${originX + 1},100`;
  tiles.set(strandedKey, { ownerId: "player-1", ownershipState: "FRONTIER" });
  return { tiles, originKey: `${originX},100`, strandedKey };
};

describe("encirclement on large empires", () => {
  it("LE1: losing the origin cuts off the frontier behind it even with a 3,600-tile settled empire", () => {
    const { tiles, originKey, strandedKey } = lostOriginScenario(60);
    let capHit = false;
    const { cutOff } = computeEncirclementDeltas([originKey], "player-1", (key) => tiles.get(key), 1_000, {
      bfsCap: COMBAT_BFS_CAP,
      onCapExceeded: () => { capHit = true; }
    });
    expect(capHit).toBe(false);
    expect([...cutOff]).toEqual([strandedKey]);
  });

  it("LE2: a frontier tile beside the lost origin that still borders the settled block is not cut off", () => {
    const { tiles, originKey } = lostOriginScenario(60);
    // Touches the origin (160,100) and the settled block's edge (159,98).
    tiles.set("160,98", { ownerId: "player-1", ownershipState: "FRONTIER" });
    tiles.delete("160,99");
    const { cutOff } = computeEncirclementDeltas([originKey], "player-1", (key) => tiles.get(key), 1_000, { bfsCap: COMBAT_BFS_CAP });
    expect(cutOff.has("160,98")).toBe(false);
    expect(cutOff.has("161,100")).toBe(true);
  });

  it("LE3: the flood reads only the frontier rings, never the settled interior", () => {
    const { tiles, originKey } = lostOriginScenario(60);
    const read = new Set<string>();
    computeEncirclementDeltas([originKey], "player-1", (key) => { read.add(key); return tiles.get(key); }, 1_000, { bfsCap: COMBAT_BFS_CAP });
    // The origin's ring plus the stranded tile's ring: at most 1 + 8 + 8 keys.
    expect(read.size).toBeLessThanOrEqual(17);
    for (const key of read) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      expect(x >= 159 && x <= 162 && y >= 99 && y <= 101, key).toBe(true);
    }
  });

  it("LE3b: a supplied frontier band larger than the cap does not mask a stranded tile beside the same change", () => {
    const tiles = new Map<string, TileStub>();
    // A 60x60 frontier band west of the origin, supplied by one settled tile at its far end.
    tiles.set("39,30", { ownerId: "player-1", ownershipState: "SETTLED" });
    for (let x = 40; x < 100; x += 1) {
      for (let y = 0; y < 60; y += 1) tiles.set(`${x},${y}`, { ownerId: "player-1", ownershipState: "FRONTIER" });
    }
    tiles.set("100,30", { ownerId: "player-2", ownershipState: "FRONTIER" }); // lost origin
    for (const y of [28, 29, 31, 32]) tiles.set(`100,${y}`, { ownerId: "player-2", ownershipState: "SETTLED" });
    for (const y of [29, 31]) tiles.set(`101,${y}`, { ownerId: "player-2", ownershipState: "SETTLED" });
    tiles.set("101,30", { ownerId: "player-1", ownershipState: "FRONTIER" }); // stranded
    tiles.set("102,30", { ownerId: "player-2", ownershipState: "SETTLED" });
    let capHits = 0;
    const { cutOff } = computeEncirclementDeltas(["100,30"], "player-1", (key) => tiles.get(key), 1_000, {
      bfsCap: COMBAT_BFS_CAP,
      onCapExceeded: () => { capHits += 1; }
    });
    expect([...cutOff]).toEqual(["101,30"]);
    expect(capHits).toBe(1); // the band capped out before reaching its supply
  });

  it("LE3c: a component that caps out before finding supply is never cut off", () => {
    const tiles = new Map<string, TileStub>();
    tiles.set("0,30", { ownerId: "player-1", ownershipState: "SETTLED" });
    for (let x = 1; x < 100; x += 1) {
      for (let y = 0; y < 60; y += 1) tiles.set(`${x},${y}`, { ownerId: "player-1", ownershipState: "FRONTIER" });
    }
    tiles.set("100,30", { ownerId: "player-2", ownershipState: "FRONTIER" });
    const { cutOff } = computeEncirclementDeltas(["100,30"], "player-1", (key) => tiles.get(key), 1_000, { bfsCap: COMBAT_BFS_CAP });
    expect(cutOff.size).toBe(0);
  });

  it("LE4: a frontier dock keeps its component supplied", () => {
    const { tiles, originKey, strandedKey } = lostOriginScenario(60);
    tiles.set(strandedKey, { ownerId: "player-1", ownershipState: "FRONTIER", dockId: "dock-1" });
    const { cutOff } = computeEncirclementDeltas([originKey], "player-1", (key) => tiles.get(key), 1_000, { bfsCap: COMBAT_BFS_CAP });
    expect(cutOff.size).toBe(0);
  });

  it("LE5: a reconnected encirclement stamp is reported, a natural decay stamp is not", () => {
    const tiles = new Map<string, TileStub>([
      ["0,0", { ownerId: "player-1", ownershipState: "SETTLED" }],
      ["1,0", { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: 5, frontierDecayKind: "ENCIRCLEMENT" }],
      ["2,0", { ownerId: "player-1", ownershipState: "FRONTIER", frontierDecayAt: 5 }]
    ]);
    const { cutOff, reconnected } = computeEncirclementDeltas(["1,0"], "player-1", (key) => tiles.get(key), 1_000);
    expect(cutOff.size).toBe(0);
    expect([...reconnected]).toEqual(["1,0"]);
  });
});
