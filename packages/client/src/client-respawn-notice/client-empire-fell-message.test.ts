import { describe, expect, it } from "vitest";

import type { PlayerRespawnNotice } from "../client-types.js";
import { empireFellMessage, isEmpireFellNotice } from "./client-empire-fell-message.js";

const notice = (overrides: Partial<PlayerRespawnNotice> = {}): PlayerRespawnNotice => ({
  id: "n", at: 1, reasonCode: "eliminated", title: "t", summary: "s", detail: "d", triggerEvent: "e",
  playerId: "p1", playerName: "Ada", previousTerritoryTiles: 0, previousTerritoryStrength: 0,
  previousExposure: 0, wasEliminated: false, respawnPending: true, spawnTileKey: "12,34", ...overrides
});
const names = new Map([["p2", "Brightwater"]]);
const nameOf = (id: string): string | undefined => names.get(id);

describe("empireFellMessage", () => {
  it("names who took the most and the new start", () => {
    expect(empireFellMessage(notice({ fellToPlayerId: "p2" }), nameOf)).toBe("Your empire fell to Brightwater. You've been given a new start at (12, 34).");
  });

  it("names barbarians without a player name", () => {
    expect(empireFellMessage(notice({ fellToPlayerId: "barbarian-1" }), nameOf)).toBe("Your empire fell to the Insurgents. You've been given a new start at (12, 34).");
  });

  it("drops the captor when it is unknown or unnamed", () => {
    expect(empireFellMessage(notice(), nameOf)).toBe("Your empire fell. You've been given a new start at (12, 34).");
    expect(empireFellMessage(notice({ fellToPlayerId: "ghost" }), nameOf)).toBe("Your empire fell. You've been given a new start at (12, 34).");
  });

  it("does not blame anyone for a withdrawal", () => {
    expect(empireFellMessage(notice({ withdrawn: true, fellToPlayerId: "p2" }), nameOf)).toBe("You withdrew your House. You've been given a new start at (12, 34).");
  });

  it("only treats eliminations as a fallen empire", () => {
    expect(isEmpireFellNotice(notice())).toBe(true);
    expect(isEmpireFellNotice(notice({ reasonCode: "auth_recovery" }))).toBe(false);
    const { spawnTileKey: _spawn, ...noSpawn } = notice();
    expect(empireFellMessage(noSpawn, nameOf)).toBe("Your empire fell. You've been given a new start.");
  });
});
