import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { DEFAULT_AUTO_SETTLE_PREFS, type ScoutDronePayload, type ScoutHeldReport } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { SCOUT_HELD_REPORT_MAX_AGE_MS } from "./scout-drone-held-report.js";
import { createScoutDroneRuntime } from "./scout-drone-runtime.js";

// Player report 2026-11-21: a drone that landed while its owner was away sent its report to nobody, so logging
// back in showed no report. The report now stays on the player until they have seen it on any device
// (SCOUT_REPORT_SEEN): players switch between desktop and phone, so "seen" can't live in one browser (owner).
const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra }) as DomainTileState;

const harness = () => {
  let now = 1_000;
  const tiles = new Map<string, DomainTileState>();
  for (let x = 0; x < 5; x += 1) tiles.set(`${x},10`, land(x, 10, { ownerId: "me", ...(x === 2 ? { afc: { ownerId: "me", status: "active" } } : {}) } as Partial<DomainTileState>));
  tiles.set("7,10", land(7, 10, { resource: "FARM" } as Partial<DomainTileState>));
  const me = { id: "me", allies: new Set(), techIds: new Set() } as unknown as DomainPlayer;
  const players = new Map([["me", me]]);
  const drones: ScoutDronePayload[] = [];
  const resolved: string[] = [];
  const runtime = createScoutDroneRuntime({
    now: () => now, worldWidth: 100, worldHeight: 60, tiles: () => tiles, players: () => players,
    afcTileKeys: () => ["2,10"], reachOwnerAt: () => undefined,
    visibilityCoverage: () => ({ addTemporaryReveal: () => undefined, removeTemporaryReveal: () => undefined }),
    visionTransitionCallbacks: () => ({}), recordPersonalImpact: () => undefined,
    emitEvent: (event) => { if (event.eventType === "COMMAND_RESOLVED") resolved.push(event.commandId); },
    emitPlayerMessage: (_command, payload) => { if (payload.type === "SCOUT_DRONE") drones.push(payload as unknown as ScoutDronePayload); }
  });
  const fly = (): void => {
    runtime.handleExplore({ commandId: "explore-1", playerId: "me", sessionId: "s", type: "EXPLORE", payloadJson: JSON.stringify({ x: 8, y: 10 }) } as unknown as CommandEnvelope);
    now = runtime.flightFor("me")!.landsAt;
    runtime.tick(now);
  };
  const logIn = (atMs = now): ScoutDronePayload => {
    now = atMs;
    runtime.sendTo("me");
    return drones.at(-1)!;
  };
  const seen = (id: string, commandId = `seen-${resolved.length}`): void =>
    runtime.handleReportSeen({ commandId, playerId: "me", sessionId: "s", type: "SCOUT_REPORT_SEEN", payloadJson: JSON.stringify({ id }) } as unknown as CommandEnvelope);
  return { runtime, me, drones, resolved, fly, logIn, seen, now: () => now };
};

describe("the last scout report stays on the player until they have seen it", () => {
  it("rides along on every login, on any device, until one says it was seen", () => {
    const h = harness();
    h.fly();
    const landing = h.drones.at(-1)!.report!;
    expect(landing).toMatchObject({ id: "explore-1", landedAt: h.now(), resourceTiles: 1 });
    expect(h.me.scoutLastReport?.id).toBe("explore-1");
    expect(h.logIn().report?.id).toBe("explore-1"); // the phone
    expect(h.logIn().report?.id).toBe("explore-1"); // the desktop, before either showed it

    const sent = h.drones.length;
    h.seen("explore-1");
    expect(h.resolved).toContain("seen-1");
    expect(h.me.scoutLastReport).toBeUndefined();
    // Resent without it at once, so the player's other devices and the gateway's replay copy drop it too.
    expect(h.drones).toHaveLength(sent + 1);
    expect(h.drones.at(-1)!.report).toBeUndefined();
    expect(h.logIn().report).toBeUndefined();
    expect(h.runtime.gauge()).toMatchObject({ heldReportsResent: 2, heldReportsSeen: 1 });
  });

  it("ignores a stale or repeated id, and still resolves it", () => {
    const h = harness();
    h.fly();
    h.seen("some-older-flight");
    expect(h.me.scoutLastReport?.id).toBe("explore-1");
    h.seen("explore-1");
    h.seen("explore-1");
    expect(h.resolved).toHaveLength(4); // the EXPLORE and three SEENs
    expect(h.runtime.gauge().heldReportsSeen).toBe(1);
  });

  it("stops riding along after a day", () => {
    const h = harness();
    h.fly();
    expect(h.logIn(h.now() + SCOUT_HELD_REPORT_MAX_AGE_MS).report).toBeUndefined();
    expect(h.me.scoutLastReport).toBeUndefined();
    expect(h.runtime.gauge().heldReportsExpired).toBe(1);
  });

  it("is saved with the player, so a restart keeps it", () => {
    const report: ScoutHeldReport = { id: "explore-9", landedAt: 500, targetX: 3, targetY: 4, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [] };
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [], players: [{ id: "scout", isAi: false, points: 0, manpower: 100, techIds: [], domainIds: [], allies: [], autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }, scoutLastReport: report }] }
    });
    expect(runtime.exportState().players.find((player) => player.id === "scout")?.scoutLastReport).toEqual(report);
    expect(JSON.stringify(runtime.exportSnapshotSections())).toContain('"scoutLastReport":{"id":"explore-9"');
  });
});
