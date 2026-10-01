import { describe, expect, it } from "vitest";
import { BARBARIAN_TILE_REST_MS } from "@border-empires/shared";
import { createBarbarianPlanner, BARBARIAN_PLAYER_ID, MAX_BARBARIAN_TILES } from "./system-job-barbarian-planner.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

const makeBarbTile = (x: number, y: number): PlannerTileView => ({
  x,
  y,
  terrain: "LAND",
  ownerId: BARBARIAN_PLAYER_ID,
  ownershipState: "FRONTIER"
});

const makePlayerTile = (x: number, y: number, ownerId = "player-1"): PlannerTileView => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED"
});

const makeBarbPlayer = (territoryTileKeys: string[]): PlannerPlayerView => ({
  id: BARBARIAN_PLAYER_ID,
  points: 9999,
  manpower: 9999,
  tileCollectionVersion: 1,
  topologyVersion: 1,
  topologyDirtyTileKeys: [],
  hasActiveLock: false,
  territoryTileKeys,
  frontierTileKeys: territoryTileKeys,
  hotFrontierTileKeys: [],
  strategicFrontierTileKeys: [],
  buildCandidateTileKeys: [],
  pendingSettlementTileKeys: [],
  activeDevelopmentProcessCount: 0
});

const tileKey = (x: number, y: number): string => `${x},${y}`;

type Harness = {
  tilesByKey: Map<string, PlannerTileView>;
  visible: Set<string>;
  clock: { t: number };
  planner: ReturnType<typeof createBarbarianPlanner>;
  choose: (territory: string[]) => ReturnType<ReturnType<typeof createBarbarianPlanner>["choose"]>;
};

let seq = 0;
const harness = (
  tiles: PlannerTileView[],
  visibleKeys: string[],
  opts: { attacksPerMinute?: number } = {}
): Harness => {
  const tilesByKey = new Map(tiles.map((t) => [tileKey(t.x, t.y), t] as const));
  const visible = new Set(visibleKeys);
  const clock = { t: 1_000 };
  const planner = createBarbarianPlanner({
    tilesByKey,
    resolveOwnedTiles: (p) => p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((x): x is PlannerTileView => !!x),
    getDockLinksByDockTileKey: () => new Map(),
    getVisibleToAnyNonBarbPlayer: () => visible,
    now: () => clock.t,
    ...(opts.attacksPerMinute !== undefined ? { attacksPerMinute: opts.attacksPerMinute } : {})
  });
  return { tilesByKey, visible, clock, planner, choose: (territory) => planner.choose(makeBarbPlayer(territory), (seq += 1), clock.t) };
};

const payloadOf = (cmd: { payloadJson: string }): Record<string, number> => JSON.parse(cmd.payloadJson) as Record<string, number>;

describe("createBarbarianPlanner rest period", () => {
  it("rests 15s counted from when the action SETTLES, not when it is issued", () => {
    const h = harness([makeBarbTile(10, 10), makePlayerTile(10, 11)], [tileKey(10, 10)]);
    const cmd = h.choose([tileKey(10, 10)]);
    expect(cmd).not.toBeNull();
    expect(BARBARIAN_TILE_REST_MS).toBe(15_000);
    // Combat lasts 30s. Issued at t=1s, settled at t=31s.
    h.clock.t = 31_000;
    h.planner.settle(cmd!.commandId, 31_000);
    expect(h.planner.cooldownByTileKey.get(tileKey(10, 10))).toBe(46_000);
    h.clock.t = 45_900;
    expect(h.choose([tileKey(10, 10)])).toBeNull();
    h.clock.t = 46_000;
    expect(h.choose([tileKey(10, 10)])).not.toBeNull();
  });

  it("a tile with an unsettled command is busy and never re-acts, however long it takes", () => {
    const h = harness([makeBarbTile(10, 10), makePlayerTile(10, 11)], [tileKey(10, 10)]);
    expect(h.choose([tileKey(10, 10)])).not.toBeNull();
    h.clock.t += 30_000;
    expect(h.choose([tileKey(10, 10)])).toBeNull();
    expect(h.planner.inFlightCount()).toBe(1);
  });

  it("expires an in-flight command whose settle never arrives, then rests", () => {
    const h = harness([makeBarbTile(10, 10), makePlayerTile(10, 11)], [tileKey(10, 10)]);
    expect(h.choose([tileKey(10, 10)])).not.toBeNull();
    h.clock.t += 45_000;
    expect(h.choose([tileKey(10, 10)])).toBeNull();
    expect(h.planner.inFlightCount()).toBe(0);
    h.clock.t += 15_000;
    expect(h.choose([tileKey(10, 10)])).not.toBeNull();
  });

  it("ignores a settle for an unknown command id", () => {
    const h = harness([makeBarbTile(10, 10)], []);
    h.planner.settle("never-issued", 5_000);
    expect(h.planner.cooldownByTileKey.size).toBe(0);
  });

  it("prevents cascade: a freshly-walked barb at the target cannot act until it has rested", () => {
    const h = harness(
      [makeBarbTile(10, 10), makePlayerTile(10, 11), makePlayerTile(10, 12)],
      [tileKey(10, 10), tileKey(10, 11)]
    );
    const first = h.choose([tileKey(10, 10)]);
    expect(first).not.toBeNull();
    expect(payloadOf(first!)).toMatchObject({ toX: 10, toY: 11 });
    h.clock.t = 31_000;
    h.planner.settle(first!.commandId, 31_000);
    // The attack won: the target is now barbarian, the origin released.
    h.tilesByKey.set(tileKey(10, 10), { x: 10, y: 10, terrain: "LAND" });
    h.tilesByKey.set(tileKey(10, 11), makeBarbTile(10, 11));
    h.clock.t = 31_050;
    expect(h.choose([tileKey(10, 11)])).toBeNull();
    h.clock.t = 46_100;
    expect(h.choose([tileKey(10, 11)])).not.toBeNull();
  });
});

describe("createBarbarianPlanner independent tiles", () => {
  it("a barb that can only walk is not starved by a barb attacking elsewhere (the 'seen but never moved' bug)", () => {
    // A (41,20) borders another player's tile and can ATTACK. B (12,10) is one
    // tile off its owner's border with only neutral neighbours: it can only walk.
    const h = harness(
      [
        makePlayerTile(10, 10, "you"),
        makeBarbTile(12, 10),
        makePlayerTile(40, 20, "other"),
        makeBarbTile(41, 20),
        { x: 11, y: 10, terrain: "LAND" }
      ],
      [tileKey(12, 10), tileKey(41, 20)]
    );
    const territory = [tileKey(12, 10), tileKey(41, 20)];
    const first = h.choose(territory);
    const second = h.choose(territory);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const sources = [first, second].map((c) => `${payloadOf(c!).fromX},${payloadOf(c!).fromY}`).sort();
    expect(sources).toEqual([tileKey(12, 10), tileKey(41, 20)]);
    expect([first, second].map((c) => c!.type).sort()).toEqual(["ATTACK", "EXPAND"]);
    expect(h.planner.inFlightCount()).toBe(2);
  });

  it("never lets an in-flight tile's target be claimed by a second barb command", () => {
    // Two barbs both border the same player tile (11,10).
    const h = harness(
      [makeBarbTile(10, 10), makePlayerTile(11, 10), makeBarbTile(12, 10)],
      [tileKey(10, 10), tileKey(12, 10)]
    );
    const territory = [tileKey(10, 10), tileKey(12, 10)];
    const first = h.choose(territory);
    expect(first).not.toBeNull();
    expect(h.choose(territory)?.payloadJson ?? "").not.toContain('"toX":11,"toY":10');
  });

  it("every seen tile acts at least once a minute, whatever the other tiles are doing", () => {
    const tiles: PlannerTileView[] = [];
    const territory: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const x = i * 3;
      // Each barb borders a player (can attack) and a neutral tile (can walk).
      tiles.push(makeBarbTile(x, 5), makePlayerTile(x, 6, `p-${i}`), { x, y: 4, terrain: "LAND" });
      territory.push(tileKey(x, 5));
    }
    const h = harness(tiles, territory);
    const lastActed = new Map<string, number>();
    let worstGapMs = 0;
    const inFlight: Array<{ id: string; settleAt: number; key: string }> = [];
    for (let step = 0; step < 600; step += 1) {
      // 500ms ticks, like the system producer.
      h.clock.t = 1_000 + step * 500;
      for (const f of inFlight.filter((x) => x.settleAt <= h.clock.t)) {
        h.planner.settle(f.id, h.clock.t);
        inFlight.splice(inFlight.indexOf(f), 1);
      }
      const cmd = h.choose(territory);
      if (!cmd) continue;
      const key = tileKey(payloadOf(cmd).fromX!, payloadOf(cmd).fromY!);
      const prev = lastActed.get(key);
      if (prev !== undefined) worstGapMs = Math.max(worstGapMs, h.clock.t - prev);
      lastActed.set(key, h.clock.t);
      // A claim resolves after 7.5s, a fight after 30s.
      inFlight.push({ id: cmd.commandId, settleAt: h.clock.t + (cmd.type === "ATTACK" ? 30_000 : 7_500), key });
    }
    expect(lastActed.size).toBe(40);
    // A fight (30s) or walk (7.5s) plus the 15s rest: never longer than 45s,
    // even though only 12 of the 40 tiles may attack per minute.
    expect(worstGapMs).toBeLessThan(60_000);
  });

  it("spends the attack budget, then walks instead of attacking", () => {
    // Three barbs each border a player tile AND a neutral tile; budget of 1.
    const tiles: PlannerTileView[] = [];
    const territory: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const x = i * 5;
      tiles.push(makeBarbTile(x, 5), makePlayerTile(x, 6, `p-${i}`), { x, y: 4, terrain: "LAND" });
      territory.push(tileKey(x, 5));
    }
    const h = harness(tiles, territory, { attacksPerMinute: 1 });
    const issued = [h.choose(territory), h.choose(territory), h.choose(territory)];
    expect(issued.filter((c) => c?.type === "ATTACK")).toHaveLength(1);
    expect(issued.filter((c) => c?.type === "EXPAND")).toHaveLength(2);
    // The budget is a rolling minute: once the window has passed and the tiles
    // have settled and rested, a tile may attack again.
    for (const c of issued) h.planner.settle(c!.commandId, 30_000);
    h.clock.t = 62_000;
    expect(h.choose(territory)?.type).toBe("ATTACK");
  });
});

describe("createBarbarianPlanner visibility", () => {
  it("ignores tiles not visible to any non-barb player (idle interior barbs cost nothing)", () => {
    const h = harness([makeBarbTile(0, 0), makeBarbTile(1, 0), makeBarbTile(0, 1)], []);
    expect(h.choose([tileKey(0, 0), tileKey(1, 0), tileKey(0, 1)])).toBeNull();
    expect(h.planner.cooldownByTileKey.size).toBe(0);
    expect(h.planner.inFlightCount()).toBe(0);
  });

  it("activates a barb that's revealed but has no orthogonal player neighbor", () => {
    const h = harness([makeBarbTile(222, 147), makePlayerTile(223, 145)], [tileKey(222, 147)]);
    // No neutral land around (222,147): null this tick.
    expect(h.choose([tileKey(222, 147)])).toBeNull();
    // Add a neutral land tile within action range; after the no-command retry
    // delay the barb walks into it.
    h.tilesByKey.set(tileKey(222, 146), { x: 222, y: 146, terrain: "LAND" });
    h.clock.t += 2_000;
    expect(h.choose([tileKey(222, 147)])).not.toBeNull();
  });
});

describe("createBarbarianPlanner territory cap", () => {
  const capWorld = (visibleKeys: (all: string[]) => string[]) => {
    const tiles: PlannerTileView[] = [];
    const territory: string[] = [];
    for (let i = 0; i < MAX_BARBARIAN_TILES; i += 1) {
      tiles.push(makeBarbTile(i, 0));
      territory.push(tileKey(i, 0));
    }
    // A neutral tile the first barb could walk into, and a player it could attack.
    tiles.push({ x: 0, y: 1, terrain: "LAND" });
    return { h: harness(tiles, visibleKeys(territory)), territory };
  };

  it("sheds a tile nobody can see once at/over the cap, even with no visible players", () => {
    const { h, territory } = capWorld(() => []);
    const cmd = h.choose(territory);
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe("UNCAPTURE_TILE");
  });

  it("keeps acting for tiles players can see while shedding unseen ones (does not freeze at the cap)", () => {
    const { h, territory } = capWorld((all) => [all[0]!]);
    const types = [h.choose(territory)?.type, h.choose(territory)?.type];
    expect(types).toContain("UNCAPTURE_TILE");
    expect(types).toContain("EXPAND");
    // The tile players can see is never the one shed while unseen tiles remain.
    const eroded = h.planner.inFlightCount();
    expect(eroded).toBe(2);
  });

  it("only sheds a tile players can see when there is nothing else for it to do", () => {
    const tiles: PlannerTileView[] = [];
    const territory: string[] = [];
    for (let i = 0; i < MAX_BARBARIAN_TILES; i += 1) {
      tiles.push(makeBarbTile(i, 0));
      territory.push(tileKey(i, 0));
    }
    const h = harness(tiles, territory); // all seen, no targets anywhere
    expect(h.choose(territory)?.type).toBe("UNCAPTURE_TILE");
  });

  it("erosion does not retarget a tile that is already being released", () => {
    const { h, territory } = capWorld(() => []);
    const first = h.choose(territory);
    const second = h.choose(territory);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(payloadOf(second!)).not.toEqual(payloadOf(first!));
  });

  it("one tile below the cap it resumes normal walk/expand behavior", () => {
    const { h, territory } = capWorld((all) => all);
    const belowCap = territory.slice(0, MAX_BARBARIAN_TILES - 1);
    const cmd = h.choose(belowCap);
    expect(cmd).not.toBeNull();
    expect(cmd!.type).not.toBe("UNCAPTURE_TILE");
  });
});

describe("createBarbarianPlanner bounded state", () => {
  it("drops bookkeeping for tiles that left barbarian ownership", () => {
    const h = harness([makeBarbTile(10, 10), makePlayerTile(10, 11)], [tileKey(10, 10)]);
    const cmd = h.choose([tileKey(10, 10)]);
    h.planner.settle(cmd!.commandId, 1_000);
    expect(h.planner.cooldownByTileKey.size).toBeGreaterThan(0);
    // The barbarian loses everything; a cleanup pass runs once the rest is over.
    h.clock.t = 200_000;
    h.tilesByKey.set(tileKey(50, 50), makeBarbTile(50, 50));
    h.choose([tileKey(50, 50)]);
    expect(h.planner.cooldownByTileKey.has(tileKey(10, 10))).toBe(false);
  });
});
