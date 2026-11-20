import { describe, expect, it } from "vitest";
import { lastManpowerRefillAtMs, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { createBarbarianPlanner } from "./system-job-barbarian-planner.js";
import type { PlannerTile } from "./frontier-scoring.js";

// Planetary Defense planner, one action per camp (docs/planetary-defense-camps-plan.md).
type Tile = PlannerTile & { campId?: string };

const key = (x: number, y: number) => `${x},${y}`;
const campTile = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", campId: key(x, y), ...extra });
const campLand = (x: number, y: number, campId: string): Tile => ({ x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER", campId });
const neutral = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra });
const house = (x: number, y: number, ownershipState: "SETTLED" | "FRONTIER" = "SETTLED", extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState, ...extra });
const sea = (x: number, y: number): Tile => ({ x, y, terrain: "SEA" });

const setup = (tiles: Tile[], options: { awake?: string[]; now?: () => number; dockLinks?: Map<string, string[]>; raids?: number; attacksPerMinute?: number } = {}) => {
  const tilesByKey = new Map(tiles.map((tile) => [key(tile.x, tile.y), tile]));
  const camps = () => [...tilesByKey].filter(([k, t]) => t.ownerId === "barbarian-1" && t.ownershipState === "SETTLED" && t.campId === k).map(([k]) => k);
  let now = 1_000;
  const planner = createBarbarianPlanner({
    tilesByKey,
    campIds: camps,
    campTiles: (campId) => [...tilesByKey.values()].filter((t) => t.ownerId === "barbarian-1" && t.campId === campId),
    getDockLinksByDockTileKey: () => options.dockLinks ?? new Map(),
    getAwakeCampIds: () => new Set(options.awake ?? camps()),
    now: options.now ?? (() => now),
    ...(options.raids !== undefined ? { raidsPerHousePerWindow: options.raids } : {}),
    ...(options.attacksPerMinute !== undefined ? { attacksPerMinute: options.attacksPerMinute } : {})
  });
  let seq = 0;
  const choose = () => {
    seq += 1;
    const command = planner.choose(seq, now);
    if (!command) return undefined;
    const payload = JSON.parse(command.payloadJson) as { fromX: number; fromY: number; toX: number; toY: number };
    return { type: command.type, from: key(payload.fromX, payload.fromY), to: key(payload.toX, payload.toY), commandId: command.commandId };
  };
  return { planner, choose, tilesByKey, advance: (ms: number) => { now += ms; }, now: () => now };
};

describe("Planetary Defense planner", () => {
  it("expands from the camp's own land into neutral ground, towns and docks first", () => {
    const { choose } = setup([campTile(10, 10), campLand(11, 10, "10,10"), neutral(9, 10), neutral(12, 10, { town: {} })]);
    expect(choose()).toMatchObject({ type: "EXPAND", from: "11,10", to: "12,10" });
  });

  it("attacks a House next to its land before expanding", () => {
    const { choose } = setup([campTile(10, 10), neutral(10, 11), house(10, 9, "FRONTIER")]);
    expect(choose()).toMatchObject({ type: "ATTACK", from: "10,10", to: "10,9" });
  });

  it("only awake camps act, and only from their own tiles", () => {
    const { choose } = setup([campTile(10, 10), neutral(10, 11), campTile(20, 20), campLand(21, 20, "20,20"), neutral(22, 20)], { awake: ["20,20"] });
    const action = choose();
    expect(["20,20", "21,20"]).toContain(action?.from);
    expect(choose()).toBeUndefined(); // the awake camp is busy, the other camp sleeps
  });

  it("one action per camp: busy until it settles, then rests", () => {
    const { planner, choose, advance } = setup([campTile(10, 10), neutral(10, 11), neutral(10, 9)]);
    const first = choose()!;
    expect(choose()).toBeUndefined();
    planner.settle(first.commandId, 1_000);
    advance(14_000);
    expect(choose()).toBeUndefined();
    advance(2_000);
    expect(choose()).toBeDefined();
  });

  it("the camp that has waited longest goes first", () => {
    const { planner, choose, advance } = setup([campTile(10, 10), neutral(10, 11), campTile(30, 30), neutral(30, 31)]);
    const first = choose()!;
    const second = choose()!;
    expect(first.from).not.toBe(second.from);
    planner.settle(first.commandId, 1_000);
    planner.settle(second.commandId, 1_000);
    advance(20_000);
    expect(choose()?.from).toBe(first.from);
  });

  it("raid limit: a camp attacks one House's garrisoned land at most N times per manpower window; frontier doesn't count", () => {
    const { planner, choose, advance, now } = setup(
      [campTile(10, 10), house(10, 9), house(11, 9), house(9, 9, "FRONTIER")],
      { raids: 2 }
    );
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const action = choose()!;
      seen.push(`${action.type}:${action.to}`);
      planner.settle(action.commandId, now());
      advance(16_000);
    }
    // Two raids on garrisoned tiles, then only the frontier tile is a target.
    expect(seen.filter((s) => s === "ATTACK:10,9" || s === "ATTACK:11,9")).toHaveLength(2);
    expect(seen[2]).toBe("ATTACK:9,9");
    // A new window for that House reopens the raids.
    advance(lastManpowerRefillAtMs("player-1", now()) + MANPOWER_REFILL_WINDOW_MS - now() + 1);
    const action = choose()!;
    expect(["10,9", "11,9"]).toContain(action.to);
  });

  it("with the attack budget spent it expands instead", () => {
    const { choose } = setup([campTile(10, 10), house(10, 9), neutral(10, 11)], { attacksPerMinute: 0 });
    expect(choose()).toMatchObject({ type: "EXPAND", to: "10,11" });
  });

  // Review regression: a target the runtime refused (an Aether Wall, a lock) was
  // retried every rest, spending the faction's attack budget and the raid limit.
  it("a rejected attack is refunded and its target avoided for a while", () => {
    const { planner, choose, advance, now } = setup([campTile(10, 10), house(10, 9), neutral(10, 11)], { raids: 1, attacksPerMinute: 1 });
    const first = choose()!;
    expect(first).toMatchObject({ type: "ATTACK", to: "10,9" });
    planner.settle(first.commandId, now(), true);
    advance(16_000);
    // The budget slot and raid were refunded, but the refused target is skipped: it expands instead.
    expect(choose()).toMatchObject({ type: "EXPAND", to: "10,11" });
  });

  it("a camp held back only by the attack budget looks again on the next call instead of sleeping", () => {
    const { planner, choose } = setup([campTile(10, 10), house(10, 9), sea(10, 11), sea(9, 9), sea(11, 9), sea(9, 10), sea(11, 10), sea(9, 11), sea(11, 11), campTile(40, 40), neutral(40, 41)], { attacksPerMinute: 1 });
    const first = choose()!; // one camp spends the only attack slot
    const second = choose(); // the other expands
    expect([first.type, second?.type].sort()).toEqual(["ATTACK", "EXPAND"]);
    planner.settle(first.commandId, 1_000, true); // refunded: the slot is free again at once
    expect(planner.restUntilByCamp.size).toBeGreaterThan(0);
  });

  it("a camp with nothing to take sleeps until something next to it changes", () => {
    const { planner, choose, tilesByKey } = setup([campTile(10, 10), sea(10, 11)]);
    expect(choose()).toBeUndefined();
    tilesByKey.set("10,11", neutral(10, 11));
    expect(choose()).toBeUndefined(); // still asleep
    planner.wakeCamp("10,10");
    expect(choose()).toMatchObject({ type: "EXPAND", to: "10,11" });
  });

  it("a camp on a dock can cross to the linked harbour's landing ground", () => {
    const tiles = [campTile(10, 10, { dockId: "dock-a" }), sea(9, 10), sea(11, 10), sea(10, 9), sea(10, 11), sea(9, 9), sea(11, 11), sea(9, 11), sea(11, 9),
      { x: 30, y: 10, terrain: "MOUNTAIN" as const, dockId: "dock-b" }, neutral(30, 11), sea(30, 12)];
    const { choose } = setup(tiles, { dockLinks: new Map([["10,10", ["30,10"]]]) });
    expect(choose()).toMatchObject({ type: "EXPAND", from: "10,10", to: "30,11" });
  });

  it("never targets Planetary Defense land, its own or another camp's", () => {
    const { choose } = setup([campTile(10, 10), campTile(11, 10), sea(9, 9), sea(9, 10), sea(9, 11), sea(10, 9), sea(10, 11), sea(11, 9), sea(11, 11), sea(12, 9), sea(12, 10), sea(12, 11)]);
    expect(choose()).toBeUndefined();
  });
});
