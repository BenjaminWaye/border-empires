import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile } from "../afc-test-fixture/afc-test-fixture.js";

// The Fortify / Siege picker (structure-tier-choice.ts): a BUILD may name the
// tier it wants. Without one the server still builds the best tier the tech
// allows -- the AI and older clients rely on that.

type SeedFort = { ownerId: string; status: "active"; variant: "PALISADE" | "FORT" | "TITANIUM_BASTION" };
const ALL_TECH = ["masonry", "fortified-walls", "steelworking", "leatherworking", "siegecraft", "standing-army"];

const makeRuntime = (techIds: string[], fort?: SeedFort, umbriteTiles = 3) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", {
      id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
      techIds: new Set<string>(techIds), domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      techRootId: "rewrite-local", allies: new Set<string>(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    }]]),
    initialState: {
      tiles: [
        afcModuleFixtureTile("player-1"),
        { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
        ...[0, 1, 2, 3].map((i) => ({ x: 4 + i, y: 12, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "TITANIUM" as const })),
        ...Array.from({ length: umbriteTiles }, (_, i) => ({ x: 4 + i, y: 14, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const, resource: "UMBRITE" as const })),
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", ...(fort ? { fort } : {}) },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
      ],
      activeLocks: [],
    },
  });
  const rejections: string[] = [];
  runtime.onEvent((e) => { if (e.eventType === "COMMAND_REJECTED") rejections.push(e.message); });
  let seq = 0;
  const send = async (type: string, payload: Record<string, unknown>) => {
    runtime.submitCommand({ commandId: `c${++seq}`, sessionId: "s", playerId: "player-1", clientSeq: seq, issuedAt: 1_000, type: type as never, payloadJson: JSON.stringify(payload) });
    await Promise.resolve();
  };
  const field = (x: number, key: "fortJson" | "siegeBatteryJson") => {
    const json = runtime.exportState().tiles.find((t) => t.x === x && t.y === 10)?.[key];
    return json ? JSON.parse(json) as { variant: string; status: string; upgradingFrom?: string } : undefined;
  };
  return { send, field, rejections, runtime };
};

describe("explicitly chosen fort tier", () => {
  it("builds the chosen lower tier instead of the best one (BUILD_FORT from the client)", async () => {
    const { send, field, rejections } = makeRuntime(ALL_TECH);
    await send("BUILD_FORT", { x: 10, y: 10, tier: "FORT" });
    expect(rejections).toEqual([]);
    expect(field(10, "fortJson")).toMatchObject({ variant: "FORT", status: "under_construction" });
  });

  it("still builds the best tier when no tier is sent", async () => {
    const { send, field } = makeRuntime(ALL_TECH);
    await send("BUILD_FORT", { x: 10, y: 10 });
    expect(field(10, "fortJson")).toMatchObject({ variant: "THUNDER_BASTION" });
  });

  it("can skip a tier when upgrading", async () => {
    const { send, field, rejections } = makeRuntime(ALL_TECH, { ownerId: "player-1", status: "active", variant: "FORT" });
    await send("BUILD_STRUCTURE", { x: 10, y: 10, structureType: "FORT", tier: "THUNDER_BASTION" });
    expect(rejections).toEqual([]);
    expect(field(10, "fortJson")).toMatchObject({ variant: "THUNDER_BASTION", upgradingFrom: "FORT" });
  });

  it("rejects an unresearched tier, a downgrade, and a tier on the wrong structure", async () => {
    const locked = makeRuntime(["masonry"]);
    await locked.send("BUILD_FORT", { x: 10, y: 10, tier: "TITANIUM_BASTION" });
    expect(locked.rejections).toEqual(["research the Titanium Bastion first"]);
    expect(locked.field(10, "fortJson")).toBeUndefined();

    const downgrade = makeRuntime(ALL_TECH, { ownerId: "player-1", status: "active", variant: "TITANIUM_BASTION" });
    await downgrade.send("BUILD_FORT", { x: 10, y: 10, tier: "FORT" });
    expect(downgrade.rejections).toEqual(["tile already has a stronger Titanium Bastion"]);

    const mismatch = makeRuntime(ALL_TECH);
    await mismatch.send("BUILD_STRUCTURE", { x: 10, y: 10, structureType: "FORT", tier: "SIEGE_TOWER" });
    await mismatch.send("BUILD_STRUCTURE", { x: 10, y: 10, structureType: "PALISADE", tier: "FORT" });
    expect(mismatch.rejections).toEqual(["tier does not match the structure", "tier does not match the structure"]);
  });
});

describe("explicitly chosen siege tier", () => {
  it("builds a Siege Battery on request even with Dread Tower tech and slots to spare", async () => {
    const { send, field, rejections } = makeRuntime(ALL_TECH);
    await send("BUILD_SIEGE_BATTERY", { x: 11, y: 10, tier: "SIEGE_BATTERY" });
    expect(rejections).toEqual([]);
    expect(field(11, "siegeBatteryJson")).toMatchObject({ variant: "SIEGE_BATTERY" });
  });

  it("does not step a chosen tier down when its slots don't fit -- it reports the shortfall", async () => {
    // 2 UMBRITE slots: a default build would step down to a Siege Tower; an explicit Dread Tower (3 slots) is refused.
    const { send, field, rejections } = makeRuntime(["leatherworking", "siegecraft", "standing-army"], undefined, 2);
    await send("BUILD_SIEGE_BATTERY", { x: 11, y: 10, tier: "DREAD_TOWER" });
    expect(rejections).toHaveLength(1);
    expect(field(11, "siegeBatteryJson")).toBeUndefined();
  });
});

describe("chosen tier through a claim continuation", () => {
  it("builds the chosen siege tier when the continuation drives the build", async () => {
    // Dread Tower tech and 3 UMBRITE slots: a default build would be a Dread Tower.
    const { send, field, rejections } = makeRuntime(ALL_TECH);
    await send("CLAIM_CONTINUATION_SET", { x: 11, y: 10, structureType: "SIEGE_BATTERY", tier: "SIEGE_TOWER" });
    expect(rejections).toEqual([]);
    expect(field(11, "siegeBatteryJson")).toMatchObject({ variant: "SIEGE_TOWER", status: "under_construction" });
  });
});

describe("chosen tier through the dev queue", () => {
  it("carries the chosen tier from the queue to the build it drains into", async () => {
    // No live subscription, so the server drains the entry straight away.
    const { send, field, rejections } = makeRuntime(ALL_TECH);
    await send("DEV_QUEUE_ENQUEUE", { x: 10, y: 10, tileKey: "10,10", kind: "BUILD", structureType: "FORT", tier: "TITANIUM_BASTION" });
    expect(rejections).toEqual([]);
    expect(field(10, "fortJson")).toMatchObject({ variant: "TITANIUM_BASTION", status: "under_construction" });
  });

  it("rejects a queued tier that could never be built", async () => {
    const { send, rejections, runtime } = makeRuntime(["masonry"]);
    await send("DEV_QUEUE_ENQUEUE", { x: 10, y: 10, tileKey: "10,10", kind: "BUILD", structureType: "FORT", tier: "THUNDER_BASTION" });
    expect(rejections).toEqual(["research the Thunder Bastion first"]);
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.devQueue ?? []).toEqual([]);
  });
});
