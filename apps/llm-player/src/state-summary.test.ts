import { describe, expect, it } from "vitest";
import type { GameInitState, GameTile } from "./game-socket.js";
import { IntentLedger } from "./intent-ledger.js";
import { summarizeTurn } from "./state-summary.js";
import { buildTileIndex } from "./viewport.js";

const PLAYER = "me";
const AMPLE = { supply: { FOOD: 99, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };

const stateWith = (tiles: GameTile[]): GameInitState => ({
  playerId: PLAYER,
  playerName: "Bot",
  gold: 1_000,
  manpower: 100,
  manpowerCap: 150,
  manpowerRegenPerMinute: 0.2,
  tiles,
  eventLog: [],
  autoSettlementQueue: [],
  techIds: [],
  resourceSlots: AMPLE
});

const summarize = (ledger: IntentLedger, tiles: GameTile[], turn = 2) => {
  const state = stateWith(tiles);
  return summarizeTurn(
    buildTileIndex(state),
    { ...state, resourceSlots: AMPLE },
    { x: 0, y: 0 },
    [],
    ledger,
    turn
  );
};

describe("summarizeTurn intent-ledger wiring", () => {
  const tiles: GameTile[] = [
    { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" },
    { x: 1, y: 0 }
  ];

  it("withholds a tech with a pending intent from techChoices", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "TECH", techId: "agriculture" }, 1, 1_000);
    const context = summarize(ledger, tiles);
    expect(context.techChoices.map((choice) => choice.id)).not.toContain("agriculture");
    expect(context.techChoices.map((choice) => choice.id)).toContain("trade");
  });

  it("withholds a structure site whose tile has a pending build, from both site lists", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "STRUCTURE", x: 0, y: 0, structureType: "RELAY_BEACON" }, 1, 1_000);
    const context = summarize(ledger, tiles);
    expect(context.beaconSites).toEqual([]);
    expect(context.structureSites.filter((site) => site.x === 0 && site.y === 0)).toEqual([]);
  });

  it("offers the same site when nothing is pending", () => {
    const context = summarize(new IntentLedger(), tiles);
    expect(context.beaconSites).toEqual([{ x: 0, y: 0 }]);
    expect(context.structureSites.map((site) => site.structureType)).toContain("WOODEN_FORT");
  });

  it("passes the ledger's summary lines through as recentOutcomes", () => {
    const ledger = new IntentLedger();
    ledger.record({ kind: "TECH", techId: "agriculture" }, 1, 1_000);
    const context = summarize(ledger, tiles);
    expect(context.recentOutcomes).toEqual([expect.stringContaining("PENDING CHOOSE_TECH(agriculture)")]);
  });
});
