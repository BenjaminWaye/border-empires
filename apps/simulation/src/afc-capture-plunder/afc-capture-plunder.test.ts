import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { afcCapturePlunderGold, withAfcCapturePlunder } from "./afc-capture-plunder.js";

const afcTile: DomainTileState = { x: 0, y: 0, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED", afc: { ownerId: "p2", status: "active", activatedAt: 0 } };
const base = { attackerWon: true, attackerId: "p1", previousTarget: afcTile, defenderPoints: 1_000, regularDefenderGoldLoss: 100 };

describe("afcCapturePlunderGold", () => {
  it("takes 33% of the Coin the defender has left after the normal pillage", () => {
    expect(afcCapturePlunderGold(base)).toBe(297); // floor(0.33 * 900)
  });

  it("takes nothing for a lost attack, a non-AFC tile, or an inert AFC someone else left", () => {
    expect(afcCapturePlunderGold({ ...base, attackerWon: false })).toBe(0);
    expect(afcCapturePlunderGold({ ...base, previousTarget: { ...afcTile, afc: undefined } as DomainTileState })).toBe(0);
    expect(afcCapturePlunderGold({ ...base, previousTarget: { ...afcTile, afc: { ownerId: "p3", status: "active", activatedAt: 0 } } })).toBe(0);
  });

  it("never goes negative when the pillage already took everything", () => {
    expect(afcCapturePlunderGold({ ...base, regularDefenderGoldLoss: 5_000 })).toBe(0);
  });

  it("folds the plunder into the reported pillagedGold", () => {
    expect(withAfcCapturePlunder({ pillagedGold: 10, attackerWon: true }, 297)).toEqual({ pillagedGold: 307, attackerWon: true });
    expect(withAfcCapturePlunder({ pillagedGold: 10 }, 0)).toEqual({ pillagedGold: 10 });
  });
});
