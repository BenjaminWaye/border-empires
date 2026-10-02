import { describe, expect, it } from "vitest";
import type { GameInitState, GameTile } from "./game-socket.js";
import { IntentLedger, reconcileFromState, type ReconcileInput } from "./intent-ledger.js";

const baseInput = (overrides: Partial<ReconcileInput> = {}): ReconcileInput => ({
  turn: 2,
  techIds: [],
  structureTypeAt: () => undefined,
  errors: [],
  ...overrides
});

const TECH = { kind: "TECH", techId: "mining" } as const;
const FORT = { kind: "STRUCTURE", x: 3, y: 4, structureType: "WOODEN_FORT" } as const;

describe("IntentLedger", () => {
  it("confirms a tech once it appears in techIds", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    const resolved = ledger.reconcile(baseInput({ techIds: ["agriculture", "mining"] }));
    expect(resolved).toEqual([{ intent: TECH, status: "confirmed", turn: 2 }]);
    expect(ledger.blocksTech("mining")).toBe(false);
  });

  it("confirms a structure once the tile carries the matching economic structure", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    const resolved = ledger.reconcile(baseInput({ structureTypeAt: (x, y) => (x === 3 && y === 4 ? "WOODEN_FORT" : undefined) }));
    expect(resolved.map((outcome) => outcome.status)).toEqual(["confirmed"]);
  });

  it("does not confirm a structure when the tile holds a different structure type", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    const resolved = ledger.reconcile(baseInput({ structureTypeAt: () => "RELAY_BEACON" }));
    expect(resolved).toEqual([]);
  });

  it("attributes an unmatched error to the pending intent and blocks a retry", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    const resolved = ledger.reconcile(
      baseInput({ errors: [{ receivedAt: 1_500, code: "TECH_INVALID", message: "requirements not met" }] })
    );
    expect(resolved).toEqual([
      { intent: TECH, status: "rejected", turn: 2, code: "TECH_INVALID", message: "requirements not met" }
    ]);
    expect(ledger.blocksTech("mining")).toBe(true);
  });

  it("ignores an error received before the intent was sent", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 2_000);
    const resolved = ledger.reconcile(baseInput({ errors: [{ receivedAt: 1_000, code: "X", message: "" }] }));
    expect(resolved).toEqual([]);
  });

  it("pins an error on the pending intent, not one that already landed", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.record(FORT, 1, 1_100);
    const resolved = ledger.reconcile(
      baseInput({ techIds: ["mining"], errors: [{ receivedAt: 1_500, code: "BUILD_INVALID", message: "tile already has structure" }] })
    );
    expect(resolved.map((outcome) => [outcome.intent.kind, outcome.status])).toEqual([
      ["TECH", "confirmed"],
      ["STRUCTURE", "rejected"]
    ]);
  });

  it("blocks the whole tile while any structure intent for it is pending", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    expect(ledger.blocksStructure(3, 4, "WOODEN_FORT")).toBe(true);
    expect(ledger.blocksStructure(3, 4, "MINE")).toBe(true);
    expect(ledger.blocksStructure(5, 5, "WOODEN_FORT")).toBe(false);
  });

  it("only cools down the specific rejected structure type, not the whole tile", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    ledger.reconcile(baseInput({ errors: [{ receivedAt: 1_500, code: "BUILD_INVALID", message: "no free slot" }] }));
    expect(ledger.blocksStructure(3, 4, "WOODEN_FORT")).toBe(true);
    expect(ledger.blocksStructure(3, 4, "MINE")).toBe(false);
  });

  it("lifts the cooldown after enough turns", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.reconcile(baseInput({ errors: [{ receivedAt: 1_500, code: "TECH_INVALID", message: "" }] }));
    expect(ledger.blocksTech("mining")).toBe(true);
    ledger.reconcile(baseInput({ turn: 20 }));
    expect(ledger.blocksTech("mining")).toBe(false);
  });

  it("reports an intent with no observable effect as unconfirmed after a few turns", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    expect(ledger.reconcile(baseInput({ turn: 3 }))).toEqual([]);
    expect(ledger.reconcile(baseInput({ turn: 4 })).map((outcome) => outcome.status)).toEqual(["unconfirmed"]);
  });

  it("summarises pending intents and recent outcomes for the model", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.record(FORT, 2, 2_000);
    ledger.reconcile(baseInput({ turn: 2, techIds: ["mining"] }));
    const lines = ledger.summaryLines(2);
    expect(lines[0]).toContain("PENDING BUILD_ECONOMIC_STRUCTURE(WOODEN_FORT) at (3,4)");
    expect(lines[1]).toBe("CHOOSE_TECH(mining): confirmed (this turn)");
  });

  it("bounds how many outcomes and pending intents it retains", () => {
    const ledger = new IntentLedger();
    for (let i = 0; i < 30; i += 1) ledger.record({ kind: "TECH", techId: `t${i}` }, 1, 1_000);
    expect(ledger.summaryLines(1).length).toBe(10);
  });

  it("pins an error on the most recently sent intent when several are pending", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.record(FORT, 2, 2_000);
    const resolved = ledger.reconcile(
      baseInput({ errors: [{ commandId: "srv", receivedAt: 2_100, code: "BUILD_INVALID", message: "no slot" }] })
    );
    expect(resolved.map((outcome) => [outcome.intent.kind, outcome.status])).toEqual([["STRUCTURE", "rejected"]]);
    expect(ledger.pendingLines()).toEqual([expect.stringContaining("CHOOSE_TECH(mining)")]);
  });

  it("upgrades an already-unconfirmed outcome when its rejection arrives late", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.reconcile(baseInput({ turn: 4 }));
    expect(ledger.hasUpgradableOutcome()).toBe(true);
    const resolved = ledger.reconcile(
      baseInput({ turn: 5, errors: [{ commandId: "srv", receivedAt: 4_000, code: "TECH_INVALID", message: "late" }] })
    );
    expect(resolved).toEqual([{ intent: TECH, status: "rejected", turn: 5, code: "TECH_INVALID", message: "late" }]);
    expect(ledger.summaryLines(5)).toEqual([expect.stringContaining("probably REJECTED")]);
    expect(ledger.blocksTech("mining")).toBe(true);
  });

  it("blocks for exactly COOLDOWN_TURNS turns after a resolution", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.reconcile(baseInput({ turn: 2, errors: [{ commandId: "srv", receivedAt: 1_500, code: "X", message: "" }] }));
    ledger.reconcile(baseInput({ turn: 6 }));
    expect(ledger.blocksTech("mining")).toBe(true);
    ledger.reconcile(baseInput({ turn: 7 }));
    expect(ledger.blocksTech("mining")).toBe(true);
    ledger.reconcile(baseInput({ turn: 8 }));
    expect(ledger.blocksTech("mining")).toBe(false);
  });

  it("tracks a different structure type recorded on a tile with a pending intent", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    ledger.record({ kind: "STRUCTURE", x: 3, y: 4, structureType: "MINE" }, 1, 1_100);
    expect(ledger.pendingLines()).toHaveLength(2);
  });

  it("does not create a second pending entry when the same intent is re-recorded", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    ledger.record(TECH, 2, 2_000);
    expect(ledger.pendingLines()).toHaveLength(1);
    // one rejection must fully clear it -- no phantom pending left behind
    ledger.reconcile(baseInput({ errors: [{ commandId: "srv", receivedAt: 3_000, code: "X", message: "" }] }));
    expect(ledger.pendingLines()).toEqual([]);
  });
});

describe("reconcileFromState", () => {
  const stateWith = (tiles: GameTile[], techIds: string[] = []): GameInitState => ({
    playerId: "me",
    playerName: "Bot",
    gold: 0,
    manpower: 0,
    manpowerCap: 0,
    manpowerRegenPerMinute: 0,
    tiles,
    eventLog: [],
    autoSettlementQueue: [],
    techIds,
    resourceSlots: {
      supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
      demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
    }
  });
  const fortJson = JSON.stringify({ type: "WOODEN_FORT" });

  it("confirms a structure on a tile we own", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    const resolved = reconcileFromState(
      ledger,
      stateWith([{ x: 3, y: 4, ownerId: "me", ownershipState: "SETTLED", economicStructureJson: fortJson }]),
      [],
      2
    );
    expect(resolved.map((outcome) => outcome.status)).toEqual(["confirmed"]);
  });

  it("does not confirm from a same-type structure on a tile someone else owns", () => {
    const ledger = new IntentLedger();
    ledger.record(FORT, 1, 1_000);
    const resolved = reconcileFromState(
      ledger,
      stateWith([{ x: 3, y: 4, ownerId: "rival", ownershipState: "SETTLED", economicStructureJson: fortJson }]),
      [],
      2
    );
    expect(resolved).toEqual([]);
  });

  it("confirms a tech from state techIds", () => {
    const ledger = new IntentLedger();
    ledger.record(TECH, 1, 1_000);
    expect(reconcileFromState(ledger, stateWith([], ["mining"]), [], 2).map((outcome) => outcome.status)).toEqual(["confirmed"]);
  });
});
