import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  SCOUT_DRONE_CHARGE_REFILL_MS,
  SCOUT_DRONE_HOME_STEP_MS,
  SCOUT_DRONE_MAX_CHARGES,
  SCOUT_DRONE_STEP_MS,
  SCOUT_DRONE_VISION_RADIUS,
  SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS,
  SCOUT_SIGHTED_ALERT_COOLDOWN_MS,
  scoutDronePositionAt,
  type ScoutDronePayload
} from "@border-empires/shared";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { createScoutDroneRuntime } from "./scout-drone-runtime.js";

const W = 100;
const H = 60;

const player = (id: string, allies: string[] = []): DomainPlayer => ({ id, allies: new Set(allies), techIds: new Set<string>() }) as unknown as DomainPlayer;
const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra }) as DomainTileState;

type Harness = ReturnType<typeof harness>;
const harness = (tileList: DomainTileState[], players: DomainPlayer[] = [player("me"), player("rival"), player("friend")]) => {
  let now = 1_000;
  const tiles = new Map(tileList.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const events: SimulationEvent[] = [];
  const messages: Array<{ playerId: string; payload: Record<string, unknown> }> = [];
  const impacts: PersonalImpactEvent[] = [];
  const reach = new Map<string, string>();
  const reveals: string[] = [];
  const live = new Map<string, number>();
  const runtime = createScoutDroneRuntime({
    now: () => now,
    worldWidth: W,
    worldHeight: H,
    tiles: () => tiles,
    players: () => playerMap,
    afcTileKeys: (id) => (id === "me" ? ["2,10"] : []),
    reachOwnerAt: (x, y) => reach.get(`${x},${y}`),
    visibilityCoverage: () => ({
      addTemporaryReveal: (viewer, x, y, radius) => {
        reveals.push(`+${viewer}@${x},${y}r${radius}`);
        live.set(`${viewer}@${x},${y}`, (live.get(`${viewer}@${x},${y}`) ?? 0) + 1);
      },
      removeTemporaryReveal: (viewer, x, y, radius) => {
        reveals.push(`-${viewer}@${x},${y}r${radius}`);
        live.set(`${viewer}@${x},${y}`, (live.get(`${viewer}@${x},${y}`) ?? 0) - 1);
      }
    }),
    visionTransitionCallbacks: () => ({}),
    emitEvent: (event) => events.push(event),
    emitPlayerMessage: (command, payload) => messages.push({ playerId: command.playerId, payload }),
    recordPersonalImpact: (event) => impacts.push(event)
  });
  const explore = (x: number, y: number, playerId = "me", commandId = `cmd-${events.length}`): void =>
    runtime.handleExplore({ commandId, playerId, sessionId: "s", type: "EXPLORE", payloadJson: JSON.stringify({ x, y }) } as unknown as CommandEnvelope);
  const exploreRoute = (stops: Array<{ x: number; y: number }>, playerId = "me", commandId = `route-${events.length}`): void =>
    runtime.handleExplore({ commandId, playerId, sessionId: "s", type: "EXPLORE", payloadJson: JSON.stringify({ ...stops[0], waypoints: stops }) } as unknown as CommandEnvelope);
  const recall = (playerId = "me", commandId = `recall-${events.length}`): void =>
    runtime.handleRecall({ commandId, playerId, sessionId: "s", type: "RECALL_SCOUT", payloadJson: "{}" } as unknown as CommandEnvelope);
  const advanceTo = (ms: number): void => {
    now = ms;
    runtime.tick(ms);
  };
  const setNow = (ms: number): void => {
    now = ms;
  };
  const liveReveals = (): number => [...live.values()].reduce((sum, n) => sum + n, 0);
  return { runtime, tiles, playerMap, reach, events, messages, impacts, reveals, explore, exploreRoute, recall, advanceTo, setNow, liveReveals, now: () => now };
};

// Own land x 0..4 on row 10 (AFC at 2,10), a town at (10,10), Planetary Defense at (12,10).
const homeRow = (afcStatus: "active" | "inactive" = "active"): DomainTileState[] =>
  [0, 1, 2, 3, 4].map((x) => land(x, 10, { ownerId: "me", ...(x === 2 ? { afc: { ownerId: "me", status: afcStatus } } : {}) }));
const lastPayload = (h: Harness, playerId = "me"): ScoutDronePayload =>
  h.messages.filter((m) => m.playerId === playerId).at(-1)!.payload as unknown as ScoutDronePayload;

describe("scout drone runtime", () => {
  it("launches from the AFC, resolves the command and starts its reveal there", () => {
    const h = harness(homeRow());
    h.explore(9, 10, "me", "c1");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "c1" });
    const payload = lastPayload(h);
    expect(payload.type).toBe("SCOUT_DRONE");
    expect(payload.flight?.steps[0]).toMatchObject({ x: 2, y: 10 });
    expect(h.reveals).toEqual([`+me@2,10r${SCOUT_DRONE_VISION_RADIUS}`]);
    expect(h.runtime.flightFor("me")).toBeDefined();
  });

  it("adds a second EXPLORE's stops to the drone in the air, and rejects a player with no AFC", () => {
    const h = harness(homeRow());
    h.explore(9, 10);
    h.explore(9, 14, "me", "c2");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "c2" });
    const extended = h.runtime.flightFor("me")!;
    expect(extended.waypoints).toEqual([{ x: 9, y: 10 }, { x: 9, y: 14 }]);
    expect(extended.steps[extended.turnIndex]).toMatchObject({ x: 9, y: 14 });
    h.explore(9, 12, "rival", "c3");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "SCOUT_NO_AFC" });
    h.runtime.handleExplore({ commandId: "c4", playerId: "me", payloadJson: "{bad", type: "EXPLORE" } as unknown as CommandEnvelope);
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "BAD_COMMAND" });
  });

  it("moves its reveal tile by tile and drops it on landing, filing a report", () => {
    const h = harness([...homeRow(), land(10, 10, { town: { type: "MARKET", populationTier: "TOWN" } as DomainTileState["town"] }), land(12, 11, { ownerId: "barbarian-1" })]);
    h.explore(9, 10, "me", "c1");
    const flight = h.runtime.flightFor("me")!;
    h.advanceTo(flight.steps[3]!.at);
    expect(h.reveals.slice(-2)).toEqual(["-me@2,10r3", `+me@${flight.steps[3]!.x},10r3`]);
    expect(h.liveReveals()).toBe(1);
    h.advanceTo(flight.landsAt);
    expect(h.liveReveals()).toBe(0);
    expect(h.runtime.flightFor("me")).toBeUndefined();
    const landed = lastPayload(h);
    expect(landed.flight).toBeNull();
    // The town (10,10) outranks Planetary Defense (12,11): Show jumps to the find, not the target (9,10).
    expect(landed.report).toMatchObject({ towns: 1, planetaryDefenseTiles: 1, targetX: 9, targetY: 10, focusX: 10, focusY: 10, empiresSighted: [] });
    expect(h.impacts.at(-1)).toMatchObject({ kind: "SCOUT_REPORT", playerId: "me", towns: 1, x: 10, y: 10 });
  });

  it("points the report at the town farthest out when it sees two, and at the target when it finds nothing", () => {
    const town = { type: "MARKET", populationTier: "TOWN" } as DomainTileState["town"];
    const h = harness([...homeRow(), land(6, 10, { town }), land(15, 10, { town })]);
    h.explore(15, 10, "me", "c1");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(lastPayload(h).report).toMatchObject({ towns: 2, focusX: 15, focusY: 10 });
    const impact = h.impacts.at(-1)!;
    expect(impact).toMatchObject({ kind: "SCOUT_REPORT", x: 15, y: 10 });
    expect(impact).not.toHaveProperty("focusX");

    const empty = harness(homeRow());
    empty.explore(9, 10, "me", "c2");
    empty.advanceTo(empty.runtime.flightFor("me")!.landsAt);
    expect(lastPayload(empty).report).toMatchObject({ targetX: 9, targetY: 10 });
    expect(lastPayload(empty).report).not.toHaveProperty("focusX");
  });

  it("names visible deposits in the report and respects the viewer's research", () => {
    for (const techIds of [new Set<string>(), new Set(["masonry"])]) {
      const h = harness([...homeRow(), land(8, 10, { resource: "FARM" }), land(9, 10, { resource: "TITANIUM" })], [{ ...player("me"), techIds }]);
      h.explore(9, 10);
      h.advanceTo(h.runtime.flightFor("me")!.landsAt);
      const resourcesSighted = [{ resource: "FARM", count: 1 }];
      if (techIds.size) resourcesSighted.push({ resource: "TITANIUM", count: 1 });
      expect(lastPayload(h).report).toMatchObject({ resourcesSighted, resourceTiles: resourcesSighted.length });
      expect(h.impacts.at(-1)).toMatchObject({ resourcesSighted });
    }
  });

  it("flies at Expand To pace past the border and fast over home land", () => {
    const h = harness(homeRow());
    h.explore(6, 10);
    const flight = h.runtime.flightFor("me")!;
    // AFC (2,10) -> 3,4 home -> 5,6 open, then straight home: each leg home is paced by the tile it
    // flies out of, so 6 -> 5 and 5 -> 4 are at scouting pace, 4 -> 3 and 3 -> 2 at home pace.
    expect(flight.landsAt - flight.launchedAt).toBe(2 * SCOUT_DRONE_HOME_STEP_MS + 2 * SCOUT_DRONE_STEP_MS + 2 * SCOUT_DRONE_STEP_MS + 2 * SCOUT_DRONE_HOME_STEP_MS);
  });

  it("flies the player's unclaimed reach at home pace, and may target a tile in it", () => {
    const h = harness(homeRow());
    h.reach.set("5,10", "me");
    h.explore(5, 10, "me", "reach-target");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "reach-target" });
    const flight = h.runtime.flightFor("me")!;
    expect(flight.landsAt - flight.launchedAt).toBe(2 * 3 * SCOUT_DRONE_HOME_STEP_MS);
  });

  it("jumps forward when the ground under and ahead of it becomes the player's reach", () => {
    const h = harness(homeRow());
    h.explore(9, 10);
    const before = h.runtime.flightFor("me")!;
    const into6 = before.steps.findIndex((s) => s.x === 6);
    const now = before.steps[into6 - 1]!.at + 750; // over x=5, heading for x=6
    for (const x of [5, 6, 7, 8]) h.reach.set(`${x},10`, "me");
    h.advanceTo(now);
    const after = h.runtime.flightFor("me")!;
    expect(after.landsAt).toBeLessThan(before.landsAt);
    expect(after.steps[into6]!.at).toBe(now);
    expect(scoutDronePositionAt(after, now, 100, 60)!.x).toBe(6);
    expect(lastPayload(h).flight).toEqual(after);
    // Nothing more changed: the next tick sends no new flight.
    const sent = h.messages.length;
    h.advanceTo(now + 100);
    expect(h.messages).toHaveLength(sent);
  });

  it("jumps forward over land claimed mid-flight, and a recall flies home over it at home pace", () => {
    const h = harness(homeRow());
    h.explore(9, 10);
    const before = h.runtime.flightFor("me")!;
    const into7 = before.steps.findIndex((s) => s.x === 7);
    const now = before.steps[into7 - 2]!.at + 250; // just past x=5, heading for x=6
    for (const x of [5, 6]) h.tiles.set(`${x},10`, land(x, 10, { ownerId: "me" }));
    h.advanceTo(now);
    h.recall();
    h.advanceTo(now + 100);
    const recalled = h.runtime.flightFor("me")!;
    expect(recalled.endReason).toBe("RECALLED");
    expect(lastPayload(h).flight).toEqual(recalled);
    // It turned over x=6; the legs home out of x=6 and x=5 (now its land) are at home pace.
    const { steps, turnIndex } = recalled;
    expect(steps[turnIndex]!.x).toBe(6);
    expect(steps[turnIndex + 1]!.at - steps[turnIndex]!.at).toBe(SCOUT_DRONE_HOME_STEP_MS);
    expect(steps[turnIndex + 2]!.at - steps[turnIndex + 1]!.at).toBe(SCOUT_DRONE_HOME_STEP_MS);
  });

  it("keeps Planetary Defense land inside the player's reach at scouting pace", () => {
    const h = harness([...homeRow(), land(5, 10, { ownerId: "barbarian-1" })]);
    h.reach.set("5,10", "me");
    h.explore(5, 10);
    const flight = h.runtime.flightFor("me")!;
    // Out: 3,4 home, 5 scouting pace; home: out of 5 (Planetary Defense, scouting pace), then out of 4 and 3 (home).
    expect(flight.landsAt - flight.launchedAt).toBe(2 * SCOUT_DRONE_HOME_STEP_MS + SCOUT_DRONE_STEP_MS + SCOUT_DRONE_STEP_MS + 2 * SCOUT_DRONE_HOME_STEP_MS);
  });

  // Owner, 2026-11-20: Planetary Defense land never blocks the drone, even on a long flight.
  it("flies straight over a wall of Planetary Defense land to a far target", () => {
    const pdWall = [8, 9, 10, 11, 12].map((y) => land(8, y, { ownerId: "barbarian-1" }));
    const h = harness([...homeRow(), ...pdWall]);
    h.explore(20, 10);
    const flight = h.runtime.flightFor("me")!;
    expect(flight.endReason).toBe("TARGET");
    expect(flight.steps[flight.turnIndex]).toMatchObject({ x: 20, y: 10 });
    expect(flight.blockedByPlayerId).toBeUndefined();
  });

  it("is turned back at a rival border, alerting the rival once per cooldown", () => {
    const rivalWall = [8, 9, 10, 11].map((y) => land(8, y, { ownerId: "rival" }));
    const h = harness([...homeRow(), ...rivalWall]);
    h.explore(15, 10, "me", "c1");
    const flight = h.runtime.flightFor("me")!;
    expect(flight).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival", blockedAtX: 8 });
    h.advanceTo(flight.steps[flight.turnIndex]!.at);
    expect(lastPayload(h, "rival")).toMatchObject({ type: "SCOUT_SIGHTED", scoutPlayerId: "me", x: 8, y: 10 });
    expect(h.impacts.at(-1)).toMatchObject({ kind: "SCOUT_SIGHTED", playerId: "rival", scoutPlayerId: "me" });
    h.advanceTo(flight.landsAt);
    expect(lastPayload(h).report?.empiresSighted).toEqual(["rival"]);
    const alertsBefore = h.messages.filter((m) => m.playerId === "rival").length;
    h.explore(15, 10, "me", "c2");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(h.messages.filter((m) => m.playerId === "rival")).toHaveLength(alertsBefore);
    h.advanceTo(h.now() + SCOUT_SIGHTED_ALERT_COOLDOWN_MS);
    h.explore(15, 10, "me", "c3");
    h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    expect(h.messages.filter((m) => m.playerId === "rival")).toHaveLength(alertsBefore + 1);
  });

  it("crosses allied land as home and does not alert the ally", () => {
    const h = harness([...homeRow(), land(5, 10, { ownerId: "friend" }), land(6, 10, { ownerId: "friend" })], [player("me", ["friend"]), player("friend", ["me"])]);
    h.explore(9, 10);
    const flight = h.runtime.flightFor("me")!;
    expect(flight.endReason).toBe("TARGET");
    h.advanceTo(flight.landsAt);
    expect(h.messages.some((m) => m.playerId === "friend")).toBe(false);
  });

  // Review of #2895: after a restart a docked drone sent nothing, so the client kept the old
  // flight and Explore stayed locked until its landing time (over an hour on a long flight).
  it("sends the flight in the air on subscribe, and an empty flight while docked", () => {
    const h = harness(homeRow());
    h.runtime.sendTo("me");
    expect(h.messages).toHaveLength(1);
    expect(lastPayload(h)).toMatchObject({ type: "SCOUT_DRONE", flight: null, charges: { max: SCOUT_DRONE_MAX_CHARGES, refillMs: SCOUT_DRONE_CHARGE_REFILL_MS, usedAt: [] } });
    h.explore(9, 10);
    h.runtime.sendTo("me");
    expect(lastPayload(h).flight?.targetX).toBe(9);
    expect(lastPayload(h).charges?.usedAt).toEqual([1_000]);
    expect(h.runtime.gauge()).toMatchObject({ activeFlights: 1, capRefusals: 0 });
  });

  it("refuses a target on the player's own land and a launch from an inactive AFC", () => {
    const h = harness(homeRow());
    h.explore(3, 10, "me", "home");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "SCOUT_TARGET_HOME" });
    const idle = harness(homeRow("inactive"));
    idle.explore(9, 10, "me", "idle");
    expect(idle.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "SCOUT_NO_AFC" });
  });

  it("turns back early when a rival claims a tile on its path mid-flight, alerting that rival", () => {
    const h = harness(homeRow());
    h.explore(12, 10, "me", "c1");
    const planned = h.runtime.flightFor("me")!;
    expect(planned.endReason).toBe("TARGET");
    // The rival claims (8, 10) while the drone is still over its own land.
    h.tiles.set("8,10", land(8, 10, { ownerId: "rival" }));
    h.advanceTo(planned.steps.find((step) => step.x === 8)!.at);
    const turned = h.runtime.flightFor("me")!;
    expect(turned).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival", blockedAtX: 8 });
    expect(turned.steps[turned.turnIndex]!.x).toBe(7);
    expect(turned.landsAt).toBeLessThan(planned.landsAt);
    expect(lastPayload(h).flight?.endReason).toBe("BLOCKED");
    expect(lastPayload(h, "rival")).toMatchObject({ type: "SCOUT_SIGHTED", scoutPlayerId: "me", x: 8 });
    h.advanceTo(turned.landsAt);
    expect(h.runtime.flightFor("me")).toBeUndefined();
    expect(lastPayload(h).report).toMatchObject({ blockedByPlayerId: "rival" });
  });

  it("logs empty or back-to-back reports to the shared Activity log at most once per interval", () => {
    const h = harness([...homeRow(), land(7, 10, { resource: "FARM" } as Partial<DomainTileState>)]);
    const fly = (x: number, id: string): void => {
      h.explore(x, 10, "me", id);
      h.advanceTo(h.runtime.flightFor("me")!.landsAt);
    };
    fly(6, "a");
    fly(6, "b");
    fly(6, "c");
    expect(h.impacts.filter((impact) => impact.kind === "SCOUT_REPORT")).toHaveLength(1);
    expect(h.messages.filter((m) => (m.payload as unknown as ScoutDronePayload).report)).toHaveLength(3);
    h.advanceTo(h.now() + SCOUT_REPORT_ACTIVITY_MIN_INTERVAL_MS);
    fly(6, "d");
    expect(h.impacts.filter((impact) => impact.kind === "SCOUT_REPORT")).toHaveLength(2);
    const empty = harness(homeRow());
    empty.explore(6, 10, "me", "e");
    empty.advanceTo(empty.runtime.flightFor("me")!.landsAt);
    expect(empty.impacts).toHaveLength(0);
  });

  describe("recall", () => {
    // Launch at 1000 from (2,10): home tiles 3,4 at home pace, then scouting pace per tile past x=4.
    const outAtX6 = 1_000 + 2 * SCOUT_DRONE_HOME_STEP_MS + 2 * SCOUT_DRONE_STEP_MS;

    it("finishes the leg it is on, then flies straight home", () => {
      const h = harness(homeRow());
      h.explore(9, 10);
      h.advanceTo(outAtX6 + 500);
      h.recall("me", "r1");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "r1" });
      const flight = lastPayload(h).flight!;
      expect(flight.endReason).toBe("RECALLED");
      expect(flight.blockedByPlayerId).toBeUndefined();
      // Between x=6 and x=7 when recalled: it turns over x=7, the tile it was flying toward.
      expect(flight.steps[flight.turnIndex]).toMatchObject({ x: 7, y: 10, at: outAtX6 + SCOUT_DRONE_STEP_MS });
      expect(flight.steps.map((s) => s.x)).toEqual([2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2]);
      // Straight home, each leg paced by the tile it flies out of: out of 7, 6 and 5 (open), then 4 and 3 (home).
      expect(flight.landsAt).toBe(outAtX6 + SCOUT_DRONE_STEP_MS + 3 * SCOUT_DRONE_STEP_MS + 2 * SCOUT_DRONE_HOME_STEP_MS);
      expect(h.runtime.flightFor("me")?.endReason).toBe("RECALLED");
      h.advanceTo(flight.landsAt);
      expect(h.runtime.flightFor("me")).toBeUndefined();
      expect(lastPayload(h).report).toMatchObject({ targetX: 9, targetY: 10 });
      expect(lastPayload(h).report?.blockedByPlayerId).toBeUndefined();
      expect(h.liveReveals()).toBe(0);
    });

    // Regression (PR #2858 review): turning over the last tile reached snapped the drone ~1.4 tiles
    // backwards on screen when recalled late in a leg, and slowed its first homeward leg.
    it("does not move the drone on screen at the moment of the recall", () => {
      const h = harness(homeRow());
      h.explore(9, 10);
      const at = outAtX6 + 0.9 * SCOUT_DRONE_STEP_MS; // late in the x=6 -> 7 leg
      h.advanceTo(at);
      const before = scoutDronePositionAt(h.runtime.flightFor("me")!, at, W, H)!;
      h.recall();
      const after = scoutDronePositionAt(h.runtime.flightFor("me")!, at, W, H)!;
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    });

    it("recalled right at launch, still flies one tile out and lands on a later tick", () => {
      const h = harness(homeRow());
      h.explore(9, 10);
      h.recall("me", "r0");
      const flight = h.runtime.flightFor("me")!;
      expect(flight.steps.map((s) => s.x)).toEqual([2, 3, 2]);
      expect(flight.landsAt).toBeGreaterThan(h.now());
      h.advanceTo(flight.landsAt);
      expect(h.runtime.flightFor("me")).toBeUndefined();
    });

    it("refuses when no drone is out", () => {
      const h = harness(homeRow());
      h.recall("me", "r1");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", commandId: "r1", code: "SCOUT_DRONE_DOCKED" });
    });

    it("refuses once the drone is already flying home, leaving its flight unchanged", () => {
      const h = harness(homeRow());
      h.explore(9, 10);
      h.advanceTo(outAtX6 + 500);
      h.recall();
      const before = h.runtime.flightFor("me");
      h.recall("me", "r2");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", commandId: "r2", code: "SCOUT_DRONE_RETURNING" });
      expect(h.runtime.flightFor("me")).toBe(before);
    });

    it("counts outbound tiles passed since the last tick toward the report before turning", () => {
      const h = harness([...homeRow(), land(9, 10, { town: { type: "MARKET", populationTier: "TOWN" } as DomainTileState["town"] })]);
      h.explore(9, 10);
      // No tick since launch: the recall itself must catch up to x=6 (the town is within radius 3).
      h.setNow(outAtX6 + 500);
      h.recall();
      const turned = h.runtime.flightFor("me")!;
      expect(turned.steps[turned.turnIndex]).toMatchObject({ x: 7, y: 10 });
      h.advanceTo(turned.landsAt);
      expect(lastPayload(h).report).toMatchObject({ towns: 1 });
    });
  });

  describe("waypoints and charges", () => {
    const chargesOf = (h: Harness): number[] | undefined => lastPayload(h).charges?.usedAt;

    it("flies through every stop and spends one charge per stop, at launch", () => {
      const h = harness(homeRow());
      h.exploreRoute([{ x: 8, y: 10 }, { x: 8, y: 14 }, { x: 12, y: 14 }], "me", "route");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "route" });
      const flight = h.runtime.flightFor("me")!;
      expect(flight.waypoints).toEqual([{ x: 8, y: 10 }, { x: 8, y: 14 }, { x: 12, y: 14 }]);
      expect(flight.steps[flight.turnIndex]).toMatchObject({ x: 12, y: 14 });
      expect(chargesOf(h)).toEqual([1_000, 1_000, 1_000]);
      h.advanceTo(flight.landsAt);
      expect(lastPayload(h)).toMatchObject({ flight: null, charges: { max: SCOUT_DRONE_MAX_CHARGES, usedAt: [1_000, 1_000, 1_000] } });
    });

    it("charges only for the stops a route cut short at a rival border reaches", () => {
      const rivalWall = [8, 9, 10, 11].map((y) => land(8, y, { ownerId: "rival" }));
      const h = harness([...homeRow(), ...rivalWall]);
      h.exploreRoute([{ x: 7, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 16 }]);
      const flight = h.runtime.flightFor("me")!;
      expect(flight.endReason).toBe("BLOCKED");
      expect(flight.waypoints).toHaveLength(2);
      expect(chargesOf(h)).toHaveLength(2);
    });

    it("refuses more stops than charges left, then flies again once they refill", () => {
      const h = harness(homeRow());
      const eight = Array.from({ length: SCOUT_DRONE_MAX_CHARGES }, (_, i) => ({ x: 6 + (i % 2), y: 10 + i }));
      h.exploreRoute(eight);
      const flight = h.runtime.flightFor("me")!;
      expect(flight.waypoints).toHaveLength(SCOUT_DRONE_MAX_CHARGES);
      h.advanceTo(flight.landsAt);
      h.explore(9, 10, "me", "empty");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", commandId: "empty", code: "SCOUT_NO_CHARGES" });
      expect(h.runtime.gauge()).toMatchObject({ noChargeRefusals: 1 });
      // Spends live on the player record, so a snapshot saves them.
      expect(h.playerMap.get("me")!.scoutChargeSpends).toHaveLength(SCOUT_DRONE_MAX_CHARGES);
      h.advanceTo(1_000 + SCOUT_DRONE_CHARGE_REFILL_MS);
      h.explore(9, 10, "me", "refilled");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "refilled" });
    });

    it("refuses a route longer than the charges left without spending any", () => {
      const h = harness(homeRow());
      const six = Array.from({ length: 6 }, (_, i) => ({ x: 6, y: 10 + i }));
      h.exploreRoute(six);
      h.advanceTo(h.runtime.flightFor("me")!.landsAt);
      h.exploreRoute([{ x: 9, y: 10 }, { x: 9, y: 12 }, { x: 9, y: 14 }], "me", "three");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", commandId: "three", code: "SCOUT_NO_CHARGES" });
      h.runtime.sendTo("me");
      expect(chargesOf(h)).toHaveLength(6);
      h.exploreRoute([{ x: 9, y: 10 }, { x: 9, y: 12 }], "me", "two");
      expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED", commandId: "two" });
    });

    it("carries the charges on every SCOUT_DRONE message", () => {
      const h = harness(homeRow());
      h.reach.set("7,10", "me");
      h.explore(9, 10);
      const before = h.runtime.flightFor("me")!;
      h.advanceTo(before.steps[2]!.at);
      h.recall();
      h.advanceTo(h.runtime.flightFor("me")!.landsAt);
      const drones = h.messages.filter((m) => m.payload.type === "SCOUT_DRONE");
      expect(drones.length).toBeGreaterThanOrEqual(3);
      for (const message of drones) expect((message.payload as unknown as ScoutDronePayload).charges?.usedAt).toEqual([1_000]);
    });

    it("counts what it sees on the straight way home in the report", () => {
      // Out along row 10 to (10,10), then down to (10,20); straight home passes (6,15), within
      // radius 3 of the town at (3,16) that no outbound tile comes near.
      const h = harness([...homeRow(), land(3, 16, { town: { type: "MARKET", populationTier: "TOWN" } as DomainTileState["town"] })]);
      h.exploreRoute([{ x: 10, y: 10 }, { x: 10, y: 20 }]);
      const flight = h.runtime.flightFor("me")!;
      const home = flight.steps.slice(flight.turnIndex + 1);
      expect(home).toContainEqual(expect.objectContaining({ x: 6, y: 15 }));
      h.advanceTo(flight.steps[flight.turnIndex]!.at);
      h.advanceTo(flight.landsAt);
      expect(lastPayload(h).report).toMatchObject({ towns: 1, targetX: 10, targetY: 20 });
    });

    it("keeps flying home when a rival claims a tile on its way home", () => {
      const h = harness(homeRow());
      h.exploreRoute([{ x: 10, y: 10 }, { x: 10, y: 20 }]);
      const flight = h.runtime.flightFor("me")!;
      h.advanceTo(flight.steps[flight.turnIndex]!.at + 1);
      const ahead = flight.steps[flight.turnIndex + 3]!;
      h.tiles.set(`${ahead.x},${ahead.y}`, land(ahead.x, ahead.y, { ownerId: "rival" }));
      h.advanceTo(ahead.at);
      expect(h.runtime.flightFor("me")).toBe(flight);
      h.advanceTo(flight.landsAt);
      expect(h.runtime.flightFor("me")).toBeUndefined();
      expect(h.messages.some((m) => m.playerId === "rival")).toBe(false);
    });
  });
});

