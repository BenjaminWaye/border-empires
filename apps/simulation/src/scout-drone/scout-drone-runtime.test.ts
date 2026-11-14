import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  SCOUT_DRONE_HOME_STEP_MS,
  SCOUT_DRONE_STEP_MS,
  SCOUT_DRONE_VISION_RADIUS,
  SCOUT_SIGHTED_ALERT_COOLDOWN_MS,
  type ScoutDronePayload
} from "@border-empires/shared";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { createScoutDroneRuntime } from "./scout-drone-runtime.js";

const W = 100;
const H = 60;

const player = (id: string, allies: string[] = []): DomainPlayer => ({ id, allies: new Set(allies) }) as unknown as DomainPlayer;
const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra }) as DomainTileState;

type Harness = ReturnType<typeof harness>;
const harness = (tileList: DomainTileState[], players: DomainPlayer[] = [player("me"), player("rival"), player("friend")]) => {
  let now = 1_000;
  const tiles = new Map(tileList.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const events: SimulationEvent[] = [];
  const messages: Array<{ playerId: string; payload: Record<string, unknown> }> = [];
  const impacts: PersonalImpactEvent[] = [];
  const reveals: string[] = [];
  const live = new Map<string, number>();
  const runtime = createScoutDroneRuntime({
    now: () => now,
    worldWidth: W,
    worldHeight: H,
    tiles: () => tiles,
    players: () => playerMap,
    afcTileKeys: (id) => (id === "me" ? ["2,10"] : []),
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
  const advanceTo = (ms: number): void => {
    now = ms;
    runtime.tick(ms);
  };
  const liveReveals = (): number => [...live.values()].reduce((sum, n) => sum + n, 0);
  return { runtime, tiles, events, messages, impacts, reveals, explore, advanceTo, liveReveals, now: () => now };
};

// Own land x 0..4 on row 10 (AFC at 2,10), a town at (10,10), Planetary Defense at (12,10).
const homeRow = (): DomainTileState[] => [0, 1, 2, 3, 4].map((x) => land(x, 10, { ownerId: "me" }));
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

  it("rejects a second launch while the drone is out, and a player with no AFC", () => {
    const h = harness(homeRow());
    h.explore(9, 10);
    h.explore(9, 12, "me", "c2");
    expect(h.events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "SCOUT_DRONE_BUSY" });
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
    expect(landed.report).toMatchObject({ towns: 1, planetaryDefenseTiles: 1, targetX: 9, targetY: 10, empiresSighted: [] });
    expect(h.impacts.at(-1)).toMatchObject({ kind: "SCOUT_REPORT", playerId: "me", towns: 1, x: 9, y: 10 });
  });

  it("flies at Expand To pace past the border and fast over home land", () => {
    const h = harness(homeRow());
    h.explore(6, 10);
    const flight = h.runtime.flightFor("me")!;
    // AFC (2,10) -> 3,4 home -> 5,6 open, then back.
    expect(flight.landsAt - flight.launchedAt).toBe(2 * (2 * SCOUT_DRONE_HOME_STEP_MS + 2 * SCOUT_DRONE_STEP_MS));
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

  it("sends the flight in the air on subscribe, and nothing while docked", () => {
    const h = harness(homeRow());
    h.runtime.sendTo("me");
    expect(h.messages).toHaveLength(0);
    h.explore(9, 10);
    h.runtime.sendTo("me");
    expect(lastPayload(h).flight?.targetX).toBe(9);
    expect(h.runtime.gauge()).toMatchObject({ activeFlights: 1, capRefusals: 0 });
  });
});
