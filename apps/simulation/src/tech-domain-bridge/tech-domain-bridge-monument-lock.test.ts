import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildTechUpdatePayload, chooseTechForPlayer } from "./tech-domain-bridge.js";
import { claimedMonumentUnlockTechIds } from "./tech-monument-unlock-lock.js";

// §16: a monument (Imperial Exchange/World Engine/Aegis Dome/Astral Dock/
// Population Bureau/Titanium Levy) is a single, season-unique prize
// (monument-uniqueness.ts). Once anyone's assembly of one stands, the tech
// that unlocks it (MONUMENT_UNLOCK_TECH_ID, packages/shared) should become
// unresearchable for every player who doesn't already own it, both at the
// command-reject gate and in the tech-tree payload the client renders.

const buildPlayer = (techIds: string[]): DomainPlayer => ({
  id: "player-2",
  isAi: false,
  points: 10_000,
  manpower: 0,
  techIds: new Set(techIds),
  allies: new Set(),
  strategicResources: {}
});

const tileWithActiveMonument = (type: string, ownerId: string): DomainTileState =>
  ({
    x: 0,
    y: 0,
    terrain: "LAND",
    ownerId,
    ownershipState: "SETTLED",
    economicStructure: { type, ownerId, status: "active" }
  }) as DomainTileState;

describe("monument-unlock tech lockout once the monument is already built", () => {
  it("claimedMonumentUnlockTechIds reports grand-levy-doctrine once Titanium Levy is standing", () => {
    const tiles = [tileWithActiveMonument("TITANIUM_LEVY", "player-1")];
    expect(claimedMonumentUnlockTechIds(tiles)).toEqual(new Set(["grand-levy-doctrine"]));
  });

  it("reports nothing when no monument has been completed", () => {
    expect(claimedMonumentUnlockTechIds([])).toEqual(new Set());
  });

  it("rejects researching the tech for a player who doesn't already have it", () => {
    const player = buildPlayer(["global-trade-networks"]);
    const tiles = [tileWithActiveMonument("TITANIUM_LEVY", "player-1")];

    const result = chooseTechForPlayer(player, "grand-levy-doctrine", tiles);

    expect(result).toEqual({ ok: false, reason: "monument already built this season" });
    expect(player.techIds.has("grand-levy-doctrine")).toBe(false);
  });

  it("does not block the tech for a player who already researched it (e.g. the builder re-syncing state)", () => {
    const player = buildPlayer(["global-trade-networks", "grand-levy-doctrine"]);
    const tiles = [tileWithActiveMonument("TITANIUM_LEVY", "player-1")];

    // chooseTechForPlayer would still no-op-reject via reachableTechChoices
    // (already owned), but the monument-lock check itself must not fire for
    // an owner — assert the reason text differs from the lockout message.
    const result = chooseTechForPlayer(player, "grand-levy-doctrine", tiles);
    expect(result).not.toEqual({ ok: false, reason: "monument already built this season" });
  });

  it("does not block an unrelated tech even while a monument is claimed", () => {
    const player = buildPlayer(["ledger-keeping"]);
    const tiles = [tileWithActiveMonument("TITANIUM_LEVY", "player-1")];

    const result = chooseTechForPlayer(player, "coinage", tiles);
    expect(result).toEqual({ ok: true });
  });

  it("drops the tech from nextChoices/techCatalog canResearch and surfaces lockedReason once claimed", () => {
    const player = buildPlayer(["global-trade-networks"]);
    const tiles = [tileWithActiveMonument("TITANIUM_LEVY", "player-1")];

    const payload = buildTechUpdatePayload(player, tiles);

    expect(payload.nextChoices).not.toContain("grand-levy-doctrine");
    const entry = payload.techCatalog.find((tech) => tech.id === "grand-levy-doctrine");
    expect(entry?.requirements.canResearch).toBe(false);
    expect(entry?.lockedReason).toBe("monument already built this season");
  });

  it("still offers the tech normally when no monument is claimed", () => {
    const player = buildPlayer(["global-trade-networks"]);

    const payload = buildTechUpdatePayload(player, []);

    expect(payload.nextChoices).toContain("grand-levy-doctrine");
    const entry = payload.techCatalog.find((tech) => tech.id === "grand-levy-doctrine");
    expect(entry?.lockedReason).toBeUndefined();
  });
});
