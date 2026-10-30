import { describe, expect, it, vi } from "vitest";

import { dispatchPactGatedAction, type PactAttackGateDeps } from "./client-pact-attack-gate.js";
import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import type { ActiveTruceView, Tile } from "../client-types.js";

const NOW = 1_000_000_000;
const tile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" };
const truce: ActiveTruceView = { otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 1, endsAt: NOW + 60_000, createdByPlayerId: "me" };

const setup = (options: { ally?: boolean; truce?: ActiveTruceView; allianceBreakEndsAt?: number } = {}) => {
  const sheets: BreakPactSheetOptions[] = [];
  const deps = {
    isTileOwnedByAlly: () => options.ally ?? false,
    activeTruceWithPlayer: () => options.truce,
    playerNameForOwner: () => "Rival",
    breakTruce: vi.fn(),
    breakAlliance: vi.fn(),
    pushFeed: vi.fn(),
    hideTileActionMenu: vi.fn(),
    showSheet: (sheet: BreakPactSheetOptions) => {
      sheets.push(sheet);
      return true;
    }
  } satisfies PactAttackGateDeps;
  const state = {
    me: "me",
    activeAllianceBreaks:
      options.allianceBreakEndsAt === undefined
        ? []
        : [{ otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 1, endsAt: options.allianceBreakEndsAt, createdByPlayerId: "me" }]
  };
  return { deps, state, sheets };
};

describe("dispatchPactGatedAction", () => {
  it("leaves attacks on an empire with no pact to the normal launch", () => {
    const { deps, state, sheets } = setup();
    expect(dispatchPactGatedAction("launch_attack", tile, state, deps, NOW)).toBe(false);
    expect(sheets).toEqual([]);
  });

  it("asks to break the truce, with its 7-day opinion cost, before attacking a truced empire", () => {
    const { deps, state, sheets } = setup({ truce });
    expect(dispatchPactGatedAction("launch_attack", tile, state, deps, NOW)).toBe(true);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.title).toBe("Break truce with Rival?");
    expect(sheets[0]!.consequences.join(" ")).toContain("−10 opinion for 7 days");
    expect(deps.breakTruce).not.toHaveBeenCalled();
    sheets[0]!.onConfirm();
    expect(deps.breakTruce).toHaveBeenCalledWith("rival");
  });

  it("confirms Break Truce from the tile menu too", () => {
    const { deps, state, sheets } = setup({ truce });
    expect(dispatchPactGatedAction("break_truce", tile, state, deps, NOW)).toBe(true);
    expect(sheets).toHaveLength(1);
    expect(deps.breakTruce).not.toHaveBeenCalled();
  });

  it("blocks attacks under a Court armistice without offering a break", () => {
    const { deps, state, sheets } = setup({ truce: { ...truce, origin: "court" } });
    expect(dispatchPactGatedAction("attack_connected_region", tile, state, deps, NOW)).toBe(true);
    expect(sheets).toEqual([]);
    expect(deps.pushFeed).toHaveBeenCalledWith(expect.stringContaining("Court armistice"), "alliance", "warn");
  });

  it("starts the 24h alliance break without queueing an attack or muster flag", () => {
    const { deps, state, sheets } = setup({ ally: true });
    expect(dispatchPactGatedAction("launch_attack", tile, state, deps, NOW)).toBe(true);
    expect(sheets[0]!.title).toBe("Break alliance with Rival?");
    expect(sheets[0]!.consequences[0]).toBe("Your alliance with Rival will be broken in 24 hours. Until then you are still allies.");
    sheets[0]!.onConfirm();
    expect(deps.breakAlliance).toHaveBeenCalledWith("rival");
    expect(deps.pushFeed).toHaveBeenCalledWith("Your alliance with Rival will be broken in 24 hours. You can attack them after that.", "alliance", "warn");
  });

  it("says when an alliance already breaking ends instead of asking again", () => {
    const { deps, state, sheets } = setup({ ally: true, allianceBreakEndsAt: NOW + 3 * 60 * 60_000 });
    expect(dispatchPactGatedAction("launch_attack", tile, state, deps, NOW)).toBe(true);
    expect(sheets).toEqual([]);
    expect(deps.breakAlliance).not.toHaveBeenCalled();
    expect(deps.pushFeed).toHaveBeenCalledWith("Your alliance with Rival is already breaking. You can attack them in 3h.", "alliance", "info");
  });
});
