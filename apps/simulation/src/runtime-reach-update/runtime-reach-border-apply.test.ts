import { describe, expect, it, vi } from "vitest";
import { TOWN_REACH_RADIUS, type ReachAnchor } from "@border-empires/shared";
import { applyReachAnchorActivationToBorder, applyReachAutoClaim, type ReachBorderApplyContext } from "./runtime-reach-border-apply.js";
import { createReachUpdateState } from "./runtime-reach-update.js";

/**
 * Regression coverage for the "settled outside anyone's reach" hole.
 *
 * A tile can be SETTLED by a player who never held reach over it — the pre-fix
 * AI auto-settle path settled its own FRONTIER tiles with no reach check, so no
 * border entry was ever written for that key. When a rival's reach later grew
 * over it, grantAnchorToBorder's empty-slot branch granted the ground silently
 * with no `overtaken` entry, so `settleOvertaken` never ran and the settled tile
 * stayed put inside the new owner's border indefinitely.
 */

type TileRecord = { ownerId?: string | undefined; ownershipState?: string | undefined };

const contextFor = (
  tiles: Record<string, TileRecord>,
  anchors: ReachAnchor[]
): { context: ReachBorderApplyContext; downgrade: ReturnType<typeof vi.fn>; autoClaim: ReturnType<typeof vi.fn> } => {
  const downgrade = vi.fn();
  const autoClaim = vi.fn();
  return {
    downgrade,
    autoClaim,
    context: {
      gatherReachAnchors: () => anchors,
      rivalOwnerIds: () => ["player-1", "player-2"],
      tileOwnership: (tileKey) => tiles[tileKey],
      downgradeToFrontier: downgrade,
      autoClaimFrontier: autoClaim
    }
  };
};

// player-1's town anchor, whose disk covers the contested tile below.
const attackerTown: ReachAnchor = { x: 10, y: 10, ownerId: "player-1", activatedAt: 5, kind: "TOWN" };
// Inside attackerTown's disk, and deliberately nowhere near player-2's own town.
const contestedKey = `${10 + TOWN_REACH_RADIUS},10`;
// player-2's only anchor, far away — so it gives no live coverage of contestedKey.
const defenderTownFarAway: ReachAnchor = { x: 300, y: 300, ownerId: "player-2", activatedAt: 1, kind: "TOWN" };

describe("applyReachAnchorActivationToBorder — settled tile on an unclaimed border slot", () => {
  it("downgrades a rival's SETTLED tile when the slot was never claimed by anyone", () => {
    const { context, downgrade } = contextFor(
      { [contestedKey]: { ownerId: "player-2", ownershipState: "SETTLED" } },
      [attackerTown, defenderTownFarAway]
    );

    const border = applyReachAnchorActivationToBorder(
      new Map(), // no border entry for contestedKey — it was settled out of reach
      attackerTown,
      createReachUpdateState(),
      context,
      "cmd-1"
    );

    expect(border.get(contestedKey)).toBe("player-1");
    expect(downgrade).toHaveBeenCalledWith(contestedKey, "cmd-1");
  });

  it("leaves the tile alone while the settled owner still has live coverage there", () => {
    // player-2's town now sits on the contested tile itself, so it is defended.
    const defenderTownOnTile: ReachAnchor = { x: 10 + TOWN_REACH_RADIUS, y: 10, ownerId: "player-2", activatedAt: 1, kind: "TOWN" };
    const { context, downgrade } = contextFor(
      { [contestedKey]: { ownerId: "player-2", ownershipState: "SETTLED" } },
      [attackerTown, defenderTownOnTile]
    );

    const border = applyReachAnchorActivationToBorder(new Map(), attackerTown, createReachUpdateState(), context, "cmd-1");

    // The defender keeps the ground outright — granting the slot while skipping
    // the downgrade would strand their SETTLED tile inside player-1's border.
    expect(border.get(contestedKey)).toBeUndefined();
    expect(downgrade).not.toHaveBeenCalled();
  });

  it("does not downgrade a rival's FRONTIER tile — there is nothing settled to lose", () => {
    const { context, downgrade } = contextFor(
      { [contestedKey]: { ownerId: "player-2", ownershipState: "FRONTIER" } },
      [attackerTown, defenderTownFarAway]
    );

    applyReachAnchorActivationToBorder(new Map(), attackerTown, createReachUpdateState(), context, "cmd-1");

    expect(downgrade).not.toHaveBeenCalled();
  });

  it("world-init seeding never contests, so rebuilding the border is not a world-wide re-contest", () => {
    const { context, downgrade } = contextFor(
      { [contestedKey]: { ownerId: "player-2", ownershipState: "SETTLED" } },
      [attackerTown, defenderTownFarAway]
    );

    applyReachAnchorActivationToBorder(new Map(), attackerTown, createReachUpdateState(), context, "world-init", {
      contestSettledOnUnclaimed: false
    });

    expect(downgrade).not.toHaveBeenCalled();
  });
});

describe("applyReachAnchorActivationToBorder — reach-driven auto-claim", () => {
  it("auto-claims a genuinely neutral tile the instant it enters the anchor owner's border", () => {
    const { context, autoClaim } = contextFor({}, [attackerTown]); // contestedKey carries no tileOwnership entry at all -- neutral

    applyReachAnchorActivationToBorder(new Map(), attackerTown, createReachUpdateState(), context, "cmd-1");

    expect(autoClaim).toHaveBeenCalledTimes(1);
    expect(autoClaim.mock.calls[0]?.[0]).toContain(contestedKey);
    expect(autoClaim.mock.calls[0]?.[1]).toBe("player-1");
    expect(autoClaim.mock.calls[0]?.[2]).toBe("cmd-1");
  });

  it("does not auto-claim ground that changed hands from a rival (overtaken territory keeps its owner)", () => {
    const { context, autoClaim } = contextFor({ [contestedKey]: { ownerId: "player-2", ownershipState: "SETTLED" } }, [attackerTown, defenderTownFarAway]);

    applyReachAnchorActivationToBorder(new Map(), attackerTown, createReachUpdateState(), context, "cmd-1");

    // The rest of the disk is still genuinely neutral ground and DOES get
    // batched into the auto-claim call; only the overtaken (previously-owned)
    // tile must be excluded from that batch.
    expect(autoClaim).toHaveBeenCalledTimes(1);
    expect(autoClaim.mock.calls[0]?.[0]).not.toContain(contestedKey);
  });

  it("skips auto-claim entirely during world-init seeding (contestSettledOnUnclaimed: false)", () => {
    const { context, autoClaim } = contextFor({}, [attackerTown]);

    applyReachAnchorActivationToBorder(new Map(), attackerTown, createReachUpdateState(), context, "world-init", {
      contestSettledOnUnclaimed: false
    });

    expect(autoClaim).not.toHaveBeenCalled();
  });
});

describe("applyReachAutoClaim", () => {
  const claimHarness = (tile: { terrain?: string; ownerId?: string } | undefined) => {
    const tiles = new Map<string, typeof tile>([["1,1", tile]]);
    const events: unknown[] = [];
    applyReachAutoClaim(["1,1"], "player-1", "cmd-1", {
      getTile: (k) => tiles.get(k),
      replaceTileState: (k, t) => tiles.set(k, t),
      tileDeltaFromState: (t) => t,
      emitEvent: (e) => events.push(e)
    });
    return { tiles, events };
  };

  it("grants free FRONTIER ownership to a neutral LAND tile", () => {
    const { tiles, events } = claimHarness({ terrain: "LAND" });
    expect(tiles.get("1,1")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(events).toHaveLength(1);
  });

  it("batches multiple tiles from one anchor activation into a single event", () => {
    const tiles = new Map<string, { terrain?: string; ownerId?: string }>([
      ["1,1", { terrain: "LAND" }],
      ["2,1", { terrain: "LAND" }],
      ["3,1", { terrain: "SEA" }] // excluded, not LAND
    ]);
    const events: Array<{ tileDeltas: unknown[] }> = [];
    applyReachAutoClaim(["1,1", "2,1", "3,1"], "player-1", "cmd-1", {
      getTile: (k) => tiles.get(k),
      replaceTileState: (k, t) => tiles.set(k, t),
      tileDeltaFromState: (t) => t,
      emitEvent: (e) => events.push(e)
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.tileDeltas).toHaveLength(2);
    expect(tiles.get("1,1")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(tiles.get("2,1")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    expect(tiles.get("3,1")).toEqual({ terrain: "SEA" });
  });

  it("does nothing to a tile that already has an owner (race-safety re-check)", () => {
    const { tiles, events } = claimHarness({ terrain: "LAND", ownerId: "player-2" });
    expect(tiles.get("1,1")).toEqual({ terrain: "LAND", ownerId: "player-2" });
    expect(events).toHaveLength(0);
  });

  it("does nothing off LAND terrain, matching EXPAND's own gate", () => {
    const { tiles, events } = claimHarness({ terrain: "SEA" });
    expect(tiles.get("1,1")).toEqual({ terrain: "SEA" });
    expect(events).toHaveLength(0);
  });
});
