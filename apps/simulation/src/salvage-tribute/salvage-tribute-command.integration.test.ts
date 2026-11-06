import { describe, expect, it, vi } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, RESOURCE_NETWORKS, lastManpowerRefillAtMs } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { salvageArmsMultForPlayer } from "../runtime-weapons-factory-mults.js";
import { toProtoEvent } from "../simulation-service/proto-serialization.js";

const now = lastManpowerRefillAtMs("p", 100 * MANPOWER_REFILL_WINDOW_MS);
const land = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
const fixture = (manpower: number) => {
  const tiles: DomainTileState[] = [{ ...land(10, 10), town: { name: "Heartland", type: "MARKET", populationTier: "TOWN", population: 50_000, maxPopulation: 100_000 } }];
  for (let i = 0; i < 12; i += 1) tiles.push({ ...land(40 + i, 40), resource: "FARM" });
  tiles.push({ ...land(20, 20), resource: "PRECURSOR_SALVAGE", economicStructure: { ownerId: "p", type: "RECLAMATION_WORKS", status: "active" } });
  const runtime = new SimulationRuntime({ now: () => now, seedTiles: new Map(), initialState: { tiles, activeLocks: [] },
    initialPlayers: new Map([["p", buildPlayer("p", { points: 100, manpower, manpowerUpdatedAt: now, landingReserveGranted: true, techIds: new Set([RESOURCE_NETWORKS.PRECURSOR_SALVAGE.tech]) })]]) });
  const events = collectEvents(runtime);
  let seq = 0;
  const ship = async (commandId: string) => {
    seq += 1;
    await runtime.submitCommand({ commandId, sessionId: "s", playerId: "p", clientSeq: seq, issuedAt: now, type: "SHIP_SALVAGE_TO_COURT", payloadJson: JSON.stringify({ x: 20, y: 20 }) });
  };
  const player = () => runtime.exportState().players.find(row => row.id === "p")!;
  const site = () => runtime.exportState().tiles.find(tile => tile.x === 20 && tile.y === 20)!;
  return { runtime, events, ship, player, site };
};

describe("shipping precursor salvage to the Court", () => {
  it("delivers a quarter of the manpower cap per load and empties the field after three loads", async () => {
    const f = fixture(0);
    const cap = f.player().manpowerCap!;
    await f.ship("load-1");
    expect(f.events.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    expect(f.player().manpower).toBeCloseTo(cap * 0.25);
    expect(JSON.parse(f.site().economicStructureJson!)).toMatchObject({ type: "RECLAMATION_WORKS", salvageLoadsShipped: 1 });
    await f.ship("load-2");
    await f.ship("load-3");
    expect(f.player().manpower).toBeCloseTo(cap * 0.75);
    expect(f.site().resource).toBeUndefined();
    expect(f.site().economicStructureJson).toBeUndefined();
    // The emptied field must reach clients as an explicit clear ("" on the wire), not an omission.
    const lastDelta = f.events.filter(event => event.eventType === "TILE_DELTA_BATCH" && event.commandId === "load-3").at(-1)!;
    const wireTile = toProtoEvent(lastDelta).tile_deltas.find(tile => tile.x === 20 && tile.y === 20);
    expect(wireTile && "resource" in wireTile ? wireTile.resource : "omitted").toBe("");
    await f.ship("load-4");
    expect(f.events.some(event => event.eventType === "COMMAND_REJECTED" && event.commandId === "load-4")).toBe(true);
  });
  it("never delivers above the cap and refuses when manpower is full", async () => {
    const f = fixture(0);
    const cap = f.player().manpowerCap!;
    const near = fixture(cap - 10);
    await near.ship("top-up");
    expect(near.player().manpower).toBeCloseTo(cap);
    const full = fixture(cap);
    await full.ship("full");
    expect(full.events.some(event => event.eventType === "COMMAND_REJECTED" && event.commandId === "full")).toBe(true);
    expect(JSON.parse(full.site().economicStructureJson!).salvageLoadsShipped).toBeUndefined();
  });
  it("dismantling a partly stripped Reclamation Works ruins the field", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(0);
      await f.ship("load-1");
      await f.runtime.submitCommand({ commandId: "remove", sessionId: "s", playerId: "p", clientSeq: 99, issuedAt: now, type: "REMOVE_STRUCTURE", payloadJson: JSON.stringify({ x: 20, y: 20 }) });
      expect((JSON.parse(f.site().economicStructureJson ?? "{}") as { status?: string }).status).toBe("removing");
      await vi.advanceTimersByTimeAsync(7 * 24 * 60 * 60_000);
      expect(f.site().economicStructureJson).toBeUndefined();
      expect(f.site().resource).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it("gives +1% attack and defense per salvage site, up to +10%", () => {
    const ctx = (count: number) => ({ ownedStructureCountForPlayer: (_: string, type: string) => type === "RECLAMATION_WORKS" ? count : 0 });
    expect(salvageArmsMultForPlayer(ctx(0), "p")).toBe(1);
    expect(salvageArmsMultForPlayer(ctx(3), "p")).toBeCloseTo(1.03);
    expect(salvageArmsMultForPlayer(ctx(14), "p")).toBeCloseTo(1.1);
    expect(salvageArmsMultForPlayer(ctx(3), undefined)).toBe(1);
  });
});
