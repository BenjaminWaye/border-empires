import { describe, expect, it } from "vitest";
import { AFC_MODULE_CALL_DOWN_MS } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { callDownAfcModules, type AfcModuleDeliveryContext } from "./afc-module-delivery.js";
import { rescheduleRecoveredStructureTimers } from "../structure-timer-recovery/structure-timer-recovery.js";

const afcTile = (x: number, y: number, afc: Partial<NonNullable<DomainTileState["afc"]>> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  afc: { ownerId: "player-1", status: "active", activatedAt: 0, ...afc }
});

const harness = (tiles: Map<string, DomainTileState>) => {
  const clock = { now: 10_000 };
  const timers: Array<{ at: number; task: () => void }> = [];
  const ctx: AfcModuleDeliveryContext = {
    tiles,
    now: () => clock.now,
    ownedAfcTileKeys: () => [...tiles].filter(([, tile]) => tile.afc?.ownerId === "player-1").map(([key]) => key),
    replaceTileState: (tileKey, tile) => tiles.set(tileKey, tile),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    emitEvent: () => {},
    emitPlayerStateUpdate: () => {},
    scheduleAfter: (delayMs, task) => { timers.push({ at: clock.now + delayMs, task }); }
  };
  const advance = (ms: number): void => {
    clock.now += ms;
    for (const timer of timers.splice(0)) {
      if (timer.at <= clock.now) timer.task();
      else timers.push(timer);
    }
  };
  return { ctx, clock, timers, advance };
};

describe("callDownAfcModules", () => {
  it("pulls the House copy off its old AFC at once and docks it at the target after one minute", () => {
    const tiles = new Map<string, DomainTileState>([
      ["1,1", afcTile(1, 1, { modules: ["masonry", "masonry"], houseModules: ["masonry"] })],
      ["5,5", afcTile(5, 5)]
    ]);
    const { ctx, advance } = harness(tiles);

    expect(callDownAfcModules(ctx, "player-1", "5,5", ["masonry"], "cmd-1")).toEqual(["masonry"]);

    // The captured duplicate stays; only the House copy leaves.
    expect(tiles.get("1,1")?.afc).toMatchObject({ modules: ["masonry"], houseModules: [] });
    expect(tiles.get("5,5")?.afc?.incomingModules).toEqual([{ techId: "masonry", arrivesAt: 10_000 + AFC_MODULE_CALL_DOWN_MS }]);
    expect(tiles.get("5,5")?.afc?.modules).toBeUndefined();

    advance(AFC_MODULE_CALL_DOWN_MS - 1);
    expect(tiles.get("5,5")?.afc?.modules).toBeUndefined();
    advance(1);
    expect(tiles.get("5,5")?.afc).toMatchObject({ modules: ["masonry"], houseModules: ["masonry"] });
    expect(tiles.get("5,5")?.afc?.incomingModules).toBeUndefined();
  });

  it("ignores a call-down for a module already docked or incoming at the target", () => {
    const tiles = new Map<string, DomainTileState>([
      ["5,5", afcTile(5, 5, { modules: ["masonry"], houseModules: ["masonry"], incomingModules: [{ techId: "workshops", arrivesAt: 1 }] })]
    ]);
    const { ctx, timers } = harness(tiles);

    expect(callDownAfcModules(ctx, "player-1", "5,5", ["masonry", "workshops"], "cmd-1")).toEqual([]);
    expect(timers).toHaveLength(0);
  });

  it("never fills more than the 8 bays, counting incoming modules", () => {
    const tiles = new Map<string, DomainTileState>([
      ["5,5", afcTile(5, 5, { modules: ["a", "b", "c", "d", "e", "f"], incomingModules: [{ techId: "g", arrivesAt: 1 }] })]
    ]);
    const { ctx } = harness(tiles);

    expect(callDownAfcModules(ctx, "player-1", "5,5", ["masonry", "workshops"], "cmd-1")).toEqual(["masonry"]);
    expect(callDownAfcModules(ctx, "player-1", "5,5", ["workshops"], "cmd-2")).toEqual([]);
  });

  it("redirects a module that is still in transit to another AFC", () => {
    const tiles = new Map<string, DomainTileState>([
      ["1,1", afcTile(1, 1, { incomingModules: [{ techId: "masonry", arrivesAt: 50_000 }] })],
      ["5,5", afcTile(5, 5)]
    ]);
    const { ctx } = harness(tiles);

    callDownAfcModules(ctx, "player-1", "5,5", ["masonry"], "cmd-1");

    expect(tiles.get("1,1")?.afc?.incomingModules).toBeUndefined();
    expect(tiles.get("5,5")?.afc?.incomingModules?.map((entry) => entry.techId)).toEqual(["masonry"]);
  });

  it("never docks a module whose target AFC was captured while it was in transit", () => {
    const tiles = new Map<string, DomainTileState>([["5,5", afcTile(5, 5)]]);
    const { ctx, advance } = harness(tiles);
    callDownAfcModules(ctx, "player-1", "5,5", ["masonry"], "cmd-1");

    tiles.set("5,5", { ...tiles.get("5,5")!, ownerId: "enemy", afc: { ownerId: "enemy", status: "active", activatedAt: 1 } });
    advance(AFC_MODULE_CALL_DOWN_MS);

    expect(tiles.get("5,5")?.afc?.modules).toBeUndefined();
  });

  it("re-arms in-transit deliveries after a restart", () => {
    const tiles = new Map<string, DomainTileState>([["5,5", afcTile(5, 5, { incomingModules: [{ techId: "masonry", arrivesAt: 40_000 }] })]]);
    const { ctx, clock, advance } = harness(tiles);

    rescheduleRecoveredStructureTimers({
      tiles,
      now: ctx.now,
      scheduleAfter: ctx.scheduleAfter,
      completeStructureBuild: () => {},
      completeStructureRemoval: () => {},
      afcModuleDelivery: () => ctx
    });
    advance(40_000 - clock.now);

    expect(tiles.get("5,5")?.afc?.houseModules).toEqual(["masonry"]);
  });
});
