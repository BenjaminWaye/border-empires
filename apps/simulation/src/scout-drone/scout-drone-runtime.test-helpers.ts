import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { ScoutDronePayload } from "@border-empires/shared";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { createScoutDroneRuntime } from "./scout-drone-runtime.js";

// The scout drone runtime with in-memory tiles, players and a recording reveal (scout-drone-runtime.test.ts,
// scout-drone-hidden-border.test.ts). `explored` decides which tiles the player has seen: every tile by
// default, so a rival border on the map is known when the route is planned.

export const W = 100;
export const H = 60;

export const player = (id: string, allies: string[] = []): DomainPlayer => ({ id, allies: new Set(allies), techIds: new Set<string>() }) as unknown as DomainPlayer;
export const land = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ...extra }) as DomainTileState;

export type Harness = ReturnType<typeof harness>;
export const harness = (
  tileList: DomainTileState[],
  players: DomainPlayer[] = [player("me"), player("rival"), player("friend")],
  explored: (playerId: string, x: number, y: number) => boolean = () => true
) => {
  let now = 1_000;
  const tiles = new Map(tileList.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const events: SimulationEvent[] = [];
  const messages: Array<{ playerId: string; payload: Record<string, unknown> }> = [];
  const impacts: PersonalImpactEvent[] = [];
  const reach = new Map<string, string>();
  const reveals: string[] = [];
  const live = new Map<string, number>();
  // What the drone's reveal has shown the player, as the explored-tile memory records it in the runtime.
  const seen = new Set<string>();
  const runtime = createScoutDroneRuntime({
    now: () => now,
    worldWidth: W,
    worldHeight: H,
    tiles: () => tiles,
    players: () => playerMap,
    afcTileKeys: (id) => (id === "me" ? ["2,10"] : []),
    reachOwnerAt: (x, y) => reach.get(`${x},${y}`),
    isExplored: (playerId, x, y) => explored(playerId, x, y) || seen.has(`${playerId}@${x},${y}`),
    visibilityCoverage: () => ({
      addTemporaryReveal: (viewer, x, y, radius) => {
        reveals.push(`+${viewer}@${x},${y}r${radius}`);
        live.set(`${viewer}@${x},${y}`, (live.get(`${viewer}@${x},${y}`) ?? 0) + 1);
        for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) seen.add(`${viewer}@${x + dx},${y + dy}`);
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
export const homeRow = (afcStatus: "active" | "inactive" = "active"): DomainTileState[] =>
  [0, 1, 2, 3, 4].map((x) => land(x, 10, { ownerId: "me", ...(x === 2 ? { afc: { ownerId: "me", status: afcStatus } } : {}) }));
export const lastPayload = (h: Harness, playerId = "me"): ScoutDronePayload => // the last message other than mid-flight SCOUT_FINDS
  h.messages.filter((m) => m.playerId === playerId && m.payload.type !== "SCOUT_FINDS").at(-1)!.payload as unknown as ScoutDronePayload;

