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

const setupWithCap = (maxCampTiles: number, tiles: Tile[], maxCamps?: number) => {
  const tilesByKey = new Map(tiles.map((tile) => [key(tile.x, tile.y), tile]));
  const planner = createBarbarianPlanner({
    tilesByKey,
    campIds: () => ["10,10"],
    campTiles: (campId) => [...tilesByKey.values()].filter((t) => t.ownerId === "barbarian-1" && t.campId === campId),
    getDockLinksByDockTileKey: () => new Map(),
    getAwakeCampIds: () => new Set(["10,10"]),
    now: () => 1_000,
    maxCampTiles,
    ...(maxCamps !== undefined ? { maxCamps } : {})
  });
  const choose = () => {
    const command = planner.choose(1, 1_000);
    if (!command) return undefined;
    const payload = JSON.parse(command.payloadJson) as { toX: number; toY: number };
    return { type: command.type, to: key(payload.toX, payload.toY) };
  };
  return { choose };
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

  it("one action per camp: busy until it settles, then rests 15 s after an attack", () => {
    const { planner, choose, advance } = setup([campTile(10, 10), house(10, 11, "FRONTIER"), house(10, 9, "FRONTIER")]);
    const first = choose()!;
    expect(first.type).toBe("ATTACK");
    expect(choose()).toBeUndefined();
    planner.settle(first.commandId, 1_000);
    advance(14_000);
    expect(choose()).toBeUndefined();
    advance(2_000);
    expect(choose()).toBeDefined();
  });

  // Regression: expansions rested only 15 s, and AI empires keep most camps awake, so every
  // camp took four neutral tiles a minute and Planetary Defense swamped the map.
  it("rests 60 s after taking neutral land", () => {
    const { planner, choose, advance } = setup([campTile(10, 10), neutral(10, 11), neutral(10, 9)]);
    const first = choose()!;
    expect(first.type).toBe("EXPAND");
    planner.settle(first.commandId, 1_000);
    advance(59_000);
    expect(choose()).toBeUndefined();
    advance(2_000);
    expect(choose()).toMatchObject({ type: "EXPAND" });
  });

  it("a refused expansion rests only the short rest", () => {
    const { planner, choose, advance } = setup([campTile(10, 10), neutral(10, 11), neutral(10, 9)]);
    const first = choose()!;
    planner.settle(first.commandId, 1_000, true);
    advance(16_000);
    expect(choose()).toMatchObject({ type: "EXPAND" });
  });

  // Regression: nothing limited a camp's size, so an awake camp kept spreading forever.
  it("a full-size camp neither expands nor attacks frontier", () => {
    const land = [campTile(10, 10), campLand(11, 10, "10,10"), campLand(12, 10, "10,10")];
    const { choose } = setupWithCap(3, [...land, neutral(10, 11), house(11, 11, "FRONTIER")]);
    expect(choose()).toBeUndefined();
    const below = setupWithCap(4, [...land, neutral(10, 11)]);
    expect(below.choose()).toMatchObject({ type: "EXPAND", to: "10,11" });
  });

  // Review regression: the size cap also stopped full camps raiding Houses at all.
  it("a full-size camp still raids garrisoned House land", () => {
    const land = [campTile(10, 10), campLand(11, 10, "10,10"), campLand(12, 10, "10,10")];
    const { choose } = setupWithCap(3, [...land, neutral(10, 11), house(11, 11, "FRONTIER"), house(12, 11)]);
    expect(choose()).toMatchObject({ type: "ATTACK", to: "12,11" });
  });

  // Review regression: at the camp cap a captured town or dock becomes more of the capturing camp
  // (camp-rules.ts), so letting a full camp take one grew it past the size cap without limit.
  it("a full-size camp takes a neutral town or dock only while it would found a new camp", () => {
    const land = [campTile(10, 10), campLand(11, 10, "10,10"), campLand(12, 10, "10,10")];
    const tiles = [...land, neutral(13, 10, { town: {} }), neutral(10, 11, { dockId: "dock-a" })];
    expect(["13,10", "10,11"]).toContain(setupWithCap(3, tiles, 2).choose()?.to);
    expect(setupWithCap(3, tiles, 1).choose()).toBeUndefined();
  });

  it("the camp that has waited longest goes first", () => {
    const { planner, choose, advance } = setup([campTile(10, 10), neutral(10, 11), campTile(30, 30), neutral(30, 31)]);
    const first = choose()!;
    const second = choose()!;
    expect(first.from).not.toBe(second.from);
    planner.settle(first.commandId, 1_000);
    planner.settle(second.commandId, 1_000);
    advance(61_000);
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

  // Review regression: rest and raid counts were memory-only, so every deploy
  // reset each camp's raid allowance mid-window.
  it("camp rest and raid counts survive a restart through exportState/restoreState", () => {
    const tiles = [campTile(10, 10), house(10, 9), house(11, 9)];
    const first = setup(tiles, { raids: 1 });
    const action = first.choose()!;
    expect(action.type).toBe("ATTACK");
    first.planner.settle(action.commandId, first.now());
    const saved = first.planner.exportState();
    expect(saved.camps).toEqual([{ campId: "10,10", restUntil: first.now() + 15_000, raids: [expect.objectContaining({ houseId: "player-1", count: 1 })] }]);

    const second = setup(tiles, { raids: 1 });
    second.planner.restoreState(JSON.parse(JSON.stringify(saved)));
    expect(second.choose()).toBeUndefined(); // still resting
    second.advance(16_000);
    expect(second.choose()).toBeUndefined(); // raid limit for player-1 already spent this window
  });

  // Raid limit compounding: every camp got its own raid allowance, so a camp founded from a House's
  // captured town attacked that House's garrisoned land again in the same window.
  it("a camp founded mid-window waits for the House's next window before raiding it", () => {
    const { choose, tilesByKey, advance, now } = setup([campTile(10, 10)]);
    expect(choose()).toBeUndefined(); // the planner has seen the camps that were already there
    advance(1_000);
    tilesByKey.set("30,30", campTile(30, 30));
    tilesByKey.set("30,29", house(30, 29));
    expect(choose()).toBeUndefined(); // new camp, garrisoned target held back
    advance(lastManpowerRefillAtMs("player-1", now()) + MANPOWER_REFILL_WINDOW_MS - now() + 1);
    expect(choose()).toMatchObject({ type: "ATTACK", from: "30,30", to: "30,29" });
  });

  it("a new camp may still take frontier and neutral land at once", () => {
    const { choose, tilesByKey } = setup([campTile(10, 10)]);
    choose();
    tilesByKey.set("30,30", campTile(30, 30));
    tilesByKey.set("30,29", house(30, 29, "FRONTIER"));
    expect(choose()).toMatchObject({ type: "ATTACK", to: "30,29" });
  });

  it("a camp's founding time survives a restart", () => {
    const first = setup([campTile(10, 10)]);
    first.choose();
    first.advance(1_000);
    first.tilesByKey.set("30,30", campTile(30, 30));
    first.tilesByKey.set("30,29", house(30, 29));
    expect(first.choose()).toBeUndefined();
    const saved = JSON.parse(JSON.stringify(first.planner.exportState())) as ReturnType<typeof first.planner.exportState>;
    expect(saved.camps).toEqual([{ campId: "30,30", foundedAt: first.now() }]);

    const second = setup([campTile(10, 10), campTile(30, 30), house(30, 29)]);
    second.advance(1_000);
    second.planner.restoreState(saved);
    expect(second.choose()).toBeUndefined(); // still waiting, although the restarted planner saw it at boot
  });

  it("restoreState ignores malformed entries", () => {
    const { planner, choose } = setup([campTile(10, 10), neutral(10, 11)]);
    planner.restoreState({ camps: [{ campId: 5 as unknown as string }, { campId: "10,10", raids: [{ houseId: "x", windowStart: Number.NaN, count: 2 }] }] });
    expect(choose()).toMatchObject({ type: "EXPAND" });
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
