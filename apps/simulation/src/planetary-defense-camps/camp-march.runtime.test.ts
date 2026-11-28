import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_TRANSIT_MS_PER_TILE } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { INSURGENT_MARCH_MESSAGE_TYPE, campMarchOrigin } from "./camp-march.js";

// REGRESSION: a Planetary Defense ATTACK or EXPAND launched from the far edge
// of a camp's land started at once, as if its soldiers were already standing
// there, so a big camp struck along its whole border with no travel time and
// nobody saw anyone walk. Every action now marches out of the camp tile: the
// lock resolves after the walk, and nearby online players are told so they can
// watch the company walk.
type Seed = Partial<DomainTileState> & { x: number; y: number };

const NOW = 1_000;
// Camp at (70,70); its land runs east to (73,70). player-1 holds (74,70) and (75,70).
const seeds: Seed[] = [
  { x: 70, y: 70, ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "70,70" },
  { x: 71, y: 70, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "70,70" },
  { x: 72, y: 70, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "70,70" },
  { x: 73, y: 70, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "70,70" },
  { x: 74, y: 70, ownerId: "player-1", ownershipState: "FRONTIER", muster: { ownerId: "player-1", amount: 500, mode: "HOLD", updatedAt: 0 } },
  { x: 75, y: 70, ownerId: "player-1", ownershipState: "SETTLED" },
  { x: 73, y: 71 },
  // offline-1 sits right beside the target, so only being offline keeps it from the march.
  { x: 74, y: 71, ownerId: "offline-1", ownershipState: "SETTLED" },
  // observer-1 (online) sees the camp but not the target four tiles east.
  { x: 69, y: 70, ownerId: "observer-1", ownershipState: "SETTLED" }
];

const buildRuntime = (world: Seed[] = seeds) => {
  const players = new Map([
    ["barbarian-1", buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })],
    ["player-1", buildPlayer("player-1", { points: 1_000, manpower: 1_000 })],
    ["offline-1", buildPlayer("offline-1", { points: 1_000, manpower: 1_000 })],
    ["observer-1", buildPlayer("observer-1", { points: 1_000, manpower: 1_000 })]
  ]);
  const runtime = new SimulationRuntime({
    now: () => NOW,
    // Run the command queue's immediate drains; leave timed lock resolutions alone.
    scheduleAfter: (delayMs, task) => {
      if (delayMs <= 0) queueMicrotask(task);
    },
    isPlayerSubscribed: (id) => id === "player-1" || id === "observer-1",
    initialPlayers: players,
    seedTiles: new Map(),
    initialState: { tiles: world.map((seed) => ({ terrain: "LAND" as const, ...seed })), activeLocks: [] }
  });
  const events: SimulationEvent[] = [];
  runtime.onEvent((event) => events.push(event));
  return { runtime, events };
};

const submitBarbarian = async (runtime: SimulationRuntime, type: "ATTACK" | "EXPAND", from: [number, number], to: [number, number]): Promise<void> => {
  runtime.submitCommand({
    commandId: `system-runtime-barbarian-1-1-${NOW}`, sessionId: "system-runtime:barbarian-1", playerId: "barbarian-1", clientSeq: 1, issuedAt: NOW, type,
    payloadJson: JSON.stringify({ fromX: from[0], fromY: from[1], toX: to[0], toY: to[1] })
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const accepted = (events: SimulationEvent[]) => events.find((e): e is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> => e.eventType === "COMMAND_ACCEPTED");
const marches = (events: SimulationEvent[]) =>
  events.filter((e): e is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> => e.eventType === "PLAYER_MESSAGE" && e.messageType === INSURGENT_MARCH_MESSAGE_TYPE);

describe("Planetary Defense companies march out of their camp", () => {
  it("an attack from the edge of the camp's land waits for the walk from the camp", async () => {
    const { runtime, events } = buildRuntime();
    await submitBarbarian(runtime, "ATTACK", [73, 70], [74, 70]);
    const event = accepted(events);
    expect(event).toBeDefined();
    // Three tiles from the camp (70,70) to the launch tile (73,70).
    expect(event!.transitEndsAt).toBe(NOW + 3 * MUSTER_TRANSIT_MS_PER_TILE);
    expect(event!.musterOriginX).toBe(70);
    expect(event!.musterOriginY).toBe(70);
    expect(event!.resolvesAt).toBeGreaterThan(event!.transitEndsAt!);
    const alert = events.find((e) => e.eventType === "PLAYER_MESSAGE" && e.messageType === "ATTACK_ALERT");
    expect(alert && "payloadJson" in alert ? JSON.parse(alert.payloadJson).transitEndsAt : undefined).toBe(NOW + 3 * MUSTER_TRANSIT_MS_PER_TILE);
  });

  it("tells online players who can see it, and nobody offline, so they can watch the company walk", async () => {
    const { runtime, events } = buildRuntime();
    await submitBarbarian(runtime, "EXPAND", [73, 70], [73, 71]);
    const sent = marches(events).filter((e) => e.playerId !== "observer-1");
    expect(sent.map((e) => e.playerId)).toEqual(["player-1"]);
    expect(JSON.parse(sent[0]!.payloadJson)).toMatchObject({
      type: INSURGENT_MARCH_MESSAGE_TYPE, actionType: "EXPAND", campX: 70, campY: 70, fromX: 73, fromY: 70, toX: 73, toY: 71,
      marchMs: 3 * MUSTER_TRANSIT_MS_PER_TILE, transitEndsAt: NOW + 3 * MUSTER_TRANSIT_MS_PER_TILE, serverNow: NOW
    });
    expect(accepted(events)!.resolvesAt).toBe(JSON.parse(sent[0]!.payloadJson).resolvesAt);
  });

  // The client draws the company along the route the server timed, sent with
  // the march, rather than planning its own (which could differ, e.g. under fog).
  it("sends the exact route it timed, round water the straight walk would cross", async () => {
    // Water at (71,70) sits on the straight walk from the camp (70,70) to (72,70).
    const world: Seed[] = [
      { x: 70, y: 70, ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "70,70" },
      { x: 71, y: 70, terrain: "SEA" },
      { x: 71, y: 71, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "70,70" },
      { x: 72, y: 70, ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "70,70" },
      { x: 73, y: 70 },
      { x: 74, y: 70, ownerId: "player-1", ownershipState: "SETTLED" }
    ];
    const { runtime, events } = buildRuntime(world);
    await submitBarbarian(runtime, "EXPAND", [72, 70], [73, 70]);
    const payload = JSON.parse(marches(events)[0]!.payloadJson);
    expect(payload.legs).toHaveLength(1);
    expect(payload.legs[0].kind).toBe("WALK");
    const points: Array<[number, number]> = payload.legs[0].points;
    expect(points[0]).toEqual([70, 70]);
    expect(points[points.length - 1]).toEqual([72, 70]);
    expect(points).not.toContainEqual([71, 70]);
    expect(payload.legMs).toEqual([payload.marchMs]);
    expect(accepted(events)!.transitEndsAt).toBe(NOW + payload.marchMs);
  });

  // Review regression: every viewer got the target's coordinates, so a player
  // who could see only the camp learned which fogged House tile was about to be hit.
  it("tells a viewer the target only if they can see it", async () => {
    const { runtime, events } = buildRuntime();
    await submitBarbarian(runtime, "ATTACK", [73, 70], [74, 70]);
    const byPlayer = new Map(marches(events).map((e) => [e.playerId, JSON.parse(e.payloadJson)]));
    expect(byPlayer.get("observer-1")).toMatchObject({ campX: 70, campY: 70 });
    expect(byPlayer.get("observer-1")).not.toHaveProperty("toX");
    expect(byPlayer.get("player-1")).toMatchObject({ toX: 74, toY: 70 });
  });

  // Review regression: right after a House took the camp tile, its land still
  // carried the campId, and an action from it was timed (and drawn) as
  // marching out of a camp the House now held.
  it("a camp tile a House has taken is no march origin", () => {
    const tiles = new Map<string, DomainTileState>([
      ["70,70", { x: 70, y: 70, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }],
      ["72,70", { x: 72, y: 70, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER", campId: "70,70" }]
    ]);
    expect(campMarchOrigin("barbarian-1", tiles, "72,70")).toBeUndefined();
    tiles.set("70,70", { x: 70, y: 70, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", campId: "70,70" });
    expect(campMarchOrigin("barbarian-1", tiles, "72,70")).toEqual({ x: 70, y: 70 });
  });

  it("a House's own attack has no camp march", async () => {
    const { runtime, events } = buildRuntime();
    runtime.submitCommand({
      commandId: "house-attack", sessionId: "s", playerId: "player-1", clientSeq: 1, issuedAt: NOW, type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 74, fromY: 70, toX: 73, toY: 70 })
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(accepted(events)).toBeDefined();
    expect(accepted(events)?.transitEndsAt).toBeUndefined();
    expect(marches(events)).toHaveLength(0);
  });
});
