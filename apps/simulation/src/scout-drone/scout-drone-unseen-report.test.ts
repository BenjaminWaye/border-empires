import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { ScoutDronePayload } from "@border-empires/shared";
import { SCOUT_UNSEEN_REPORT_MAX_AGE_MS, createScoutDroneRuntime } from "./scout-drone-runtime.js";

// Player report 2026-11-21: a drone that landed while its owner was logged off sent its report to nobody,
// so logging back in showed no report. The runtime now holds it for the next subscribe.
const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra }) as DomainTileState;

const harness = () => {
  let now = 1_000;
  let online = true;
  const tiles = new Map<string, DomainTileState>();
  for (let x = 0; x < 5; x += 1) tiles.set(`${x},10`, land(x, 10, { ownerId: "me", ...(x === 2 ? { afc: { ownerId: "me", status: "active" } } : {}) } as Partial<DomainTileState>));
  tiles.set("7,10", land(7, 10, { resource: "FARM" } as Partial<DomainTileState>));
  const players = new Map([["me", { id: "me", allies: new Set(), techIds: new Set() } as unknown as DomainPlayer]]);
  const drones: ScoutDronePayload[] = [];
  const runtime = createScoutDroneRuntime({
    now: () => now, worldWidth: 100, worldHeight: 60, tiles: () => tiles, players: () => players,
    afcTileKeys: () => ["2,10"], reachOwnerAt: () => undefined,
    visibilityCoverage: () => ({ addTemporaryReveal: () => undefined, removeTemporaryReveal: () => undefined }),
    visionTransitionCallbacks: () => ({}), emitEvent: () => undefined, recordPersonalImpact: () => undefined,
    emitPlayerMessage: (_command, payload) => { if (payload.type === "SCOUT_DRONE") drones.push(payload as unknown as ScoutDronePayload); },
    isPlayerSubscribed: () => online
  });
  const flyOffline = (): void => {
    runtime.handleExplore({ commandId: `c${now}`, playerId: "me", sessionId: "s", type: "EXPLORE", payloadJson: JSON.stringify({ x: 8, y: 10 }) } as unknown as CommandEnvelope);
    online = false;
    now = runtime.flightFor("me")!.landsAt;
    runtime.tick(now);
  };
  const logIn = (atMs = now): ScoutDronePayload => {
    now = atMs;
    online = true;
    runtime.sendTo("me");
    return drones.at(-1)!;
  };
  return { runtime, flyOffline, logIn, now: () => now };
};

describe("a scout report that landed while the player was away", () => {
  it("comes with the drone on the next login, once", () => {
    const h = harness();
    h.flyOffline();
    expect(h.runtime.gauge().unseenReports).toBe(1);
    expect(h.logIn()).toMatchObject({ flight: null, report: { resourceTiles: 1, targetX: 8 } });
    expect(h.logIn().report).toBeUndefined();
    expect(h.runtime.gauge()).toMatchObject({ unseenReports: 0, unseenReportsDelivered: 1 });
  });

  it("is not held when the player watched it land", () => {
    const h = harness();
    h.logIn();
    h.runtime.handleExplore({ commandId: "c", playerId: "me", sessionId: "s", type: "EXPLORE", payloadJson: JSON.stringify({ x: 8, y: 10 }) } as unknown as CommandEnvelope);
    h.runtime.tick(h.runtime.flightFor("me")!.landsAt);
    expect(h.runtime.gauge().unseenReports).toBe(0);
  });

  it("is dropped after a day", () => {
    const h = harness();
    h.flyOffline();
    h.runtime.tick(h.now() + SCOUT_UNSEEN_REPORT_MAX_AGE_MS);
    expect(h.logIn(h.now() + SCOUT_UNSEEN_REPORT_MAX_AGE_MS).report).toBeUndefined();
    expect(h.runtime.gauge()).toMatchObject({ unseenReports: 0, unseenReportsDropped: 1 });
  });
});
