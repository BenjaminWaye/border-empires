import { describe, expect, it } from "vitest";

import { WORLD_WIDTH } from "@border-empires/shared";
import {
  HOSTILE_MUSTER_ANNOUNCE_MEMORY_MS,
  HOSTILE_MUSTER_BORDER_RADIUS_TILES,
  createHostileMusterAnnouncer,
  hostileMusterNearBorder,
  type HostileMusterAlertState,
  type HostileMusterNearBorder
} from "./client-hostile-muster-alerts.js";
import type { Tile } from "../client-types.js";

const landTile = (x: number, y: number, ownerId: string | undefined, extra: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...(ownerId ? { ownerId, ownershipState: "SETTLED" as const } : {}),
  ...extra
});

const flagTile = (x: number, y: number, ownerId: string, muster: Partial<NonNullable<Tile["muster"]>> = {}, extra: Partial<Tile> = {}): Tile =>
  landTile(x, y, ownerId, { muster: { ownerId, amount: 80, mode: "HOLD", updatedAt: 0, ...muster }, ...extra });

const stateWith = (tiles: Tile[], extra: Partial<HostileMusterAlertState> = {}): HostileMusterAlertState => ({
  me: "me",
  tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])),
  playerNames: new Map([["enemy", "Vorland"]]),
  ...extra
});

describe("hostileMusterNearBorder", () => {
  it("flags an enemy muster flag within the border radius, with distance and owner name", () => {
    const flag = flagTile(13, 10, "enemy", { mode: "ADVANCE" });
    const state = stateWith([landTile(10, 10, "me"), flag]);
    expect(hostileMusterNearBorder(state, flag)).toEqual({
      x: 13,
      y: 10,
      ownerId: "enemy",
      ownerName: "Vorland",
      mode: "ADVANCE",
      distanceTiles: 3,
      marchingOnUs: false
    });
  });

  it("ignores a flag farther than the radius from any owned tile", () => {
    const flag = flagTile(10 + HOSTILE_MUSTER_BORDER_RADIUS_TILES + 1, 10, "enemy");
    expect(hostileMusterNearBorder(stateWith([landTile(10, 10, "me"), flag]), flag)).toBeUndefined();
  });

  it("measures distance across the world's wrap edge", () => {
    const flag = flagTile(1, 5, "enemy");
    const state = stateWith([landTile(WORLD_WIDTH - 1, 5, "me"), flag]);
    expect(hostileMusterNearBorder(state, flag)?.distanceTiles).toBe(2);
  });

  it("ignores own, allied, truce-partner and fogged flags", () => {
    const own = flagTile(11, 10, "me");
    const ally = flagTile(11, 11, "ally");
    const truce = flagTile(11, 9, "truce");
    const fogged = flagTile(9, 10, "enemy", {}, { fogged: true });
    const state = stateWith([landTile(10, 10, "me"), own, ally, truce, fogged], {
      allies: ["ally"],
      activeTruces: [{ otherPlayerId: "truce", otherPlayerName: "T", startedAt: 0, endsAt: Date.now() + 60_000, createdByPlayerId: "truce" }]
    });
    for (const tile of [own, ally, truce, fogged]) expect(hostileMusterNearBorder(state, tile)).toBeUndefined();
  });

  it("treats a truce partner as hostile once the truce has run out", () => {
    const flag = flagTile(11, 10, "truce");
    const state = stateWith([landTile(10, 10, "me"), flag], {
      activeTruces: [{ otherPlayerId: "truce", otherPlayerName: "T", startedAt: 0, endsAt: 1_000, createdByPlayerId: "truce" }]
    });
    expect(hostileMusterNearBorder(state, flag, 999)).toBeUndefined();
    expect(hostileMusterNearBorder(state, flag, 1_001)?.ownerId).toBe("truce");
  });

  it("marks a MARCH flag targeting one of our tiles as marching on us", () => {
    const flag = flagTile(12, 10, "enemy", { mode: "MARCH", targetX: 10, targetY: 10 });
    const state = stateWith([landTile(10, 10, "me"), flag]);
    expect(hostileMusterNearBorder(state, flag)?.marchingOnUs).toBe(true);
  });
});

const near = (overrides: Partial<HostileMusterNearBorder> = {}): HostileMusterNearBorder => ({
  x: 5,
  y: 5,
  ownerId: "enemy",
  ownerName: "Vorland",
  mode: "HOLD",
  distanceTiles: 2,
  marchingOnUs: false,
  ...overrides
});

const SHOW = { canShow: true, silent: false };

describe("createHostileMusterAnnouncer", () => {
  it("announces a new flag once, focused on the flag", () => {
    const announcer = createHostileMusterAnnouncer();
    expect(announcer.announce([near()], 0, SHOW)).toMatchObject({
      title: "Enemy muster flag near your border",
      detail: "Vorland is mustering troops 2 tiles from your border.",
      tone: "warn",
      focus: { x: 5, y: 5 }
    });
    expect(announcer.announce([near()], 220, SHOW)).toBeUndefined();
  });

  it("groups several new flags into one entry led by the most threatening", () => {
    const announcer = createHostileMusterAnnouncer();
    const entry = announcer.announce([near({ x: 1 }), near({ x: 2, mode: "ADVANCE", distanceTiles: 4 })], 0, SHOW);
    expect(entry).toMatchObject({ title: "2 enemy muster flags near your border", tone: "error", focus: { x: 2, y: 5 } });
  });

  it("does not re-announce a flag that briefly drops out of view, but does after the memory window", () => {
    const announcer = createHostileMusterAnnouncer();
    announcer.announce([near()], 0, SHOW);
    announcer.announce([], 1_000, SHOW);
    expect(announcer.announce([near()], 2_000, SHOW)).toBeUndefined();
    announcer.announce([], 3_000, SHOW);
    expect(announcer.trackedCount()).toBe(1);
    announcer.announce([], 3_000 + HOSTILE_MUSTER_ANNOUNCE_MEMORY_MS + 1, SHOW);
    expect(announcer.trackedCount()).toBe(0);
    expect(announcer.announce([near()], 3_000 + HOSTILE_MUSTER_ANNOUNCE_MEMORY_MS + 2, SHOW)).toBeDefined();
  });

  it("announces a seen flag again when it escalates, but not when it calms down", () => {
    const announcer = createHostileMusterAnnouncer();
    announcer.announce([near()], 0, SHOW);
    expect(announcer.announce([near({ mode: "ADVANCE" })], 220, SHOW)).toMatchObject({ tone: "error" });
    expect(announcer.announce([near({ mode: "MARCH", marchingOnUs: true })], 440, SHOW)?.detail).toBe("Vorland's muster flag is marching on your land.");
    expect(announcer.announce([near()], 660, SHOW)).toBeUndefined();
    expect(announcer.announce([near({ mode: "ADVANCE" })], 880, SHOW)).toBeDefined();
  });

  it("holds a new flag while another toast is showing and announces it once the slot frees", () => {
    const announcer = createHostileMusterAnnouncer();
    expect(announcer.announce([near()], 0, { canShow: false, silent: false })).toBeUndefined();
    expect(announcer.announce([near()], 220, { canShow: false, silent: false })).toBeUndefined();
    expect(announcer.announce([near()], 440, SHOW)).toBeDefined();
    expect(announcer.announce([near()], 660, SHOW)).toBeUndefined();
  });

  it("records flags silently during warm-up so long-standing flags are not announced as new", () => {
    const announcer = createHostileMusterAnnouncer();
    expect(announcer.announce([near()], 0, { canShow: true, silent: true })).toBeUndefined();
    expect(announcer.announce([near()], 220, SHOW)).toBeUndefined();
    expect(announcer.announce([near(), near({ x: 9 })], 440, SHOW)).toMatchObject({ focus: { x: 9, y: 5 } });
  });
});
