import { describe, expect, it } from "vitest";

import { attackPreviewResult, makeGetPlayerFactoryCounts } from "./attack-preview.js";

describe("attackPreviewResult", () => {
  // Both factory types owned by the defender, so the "no war industry"
  // vulnerability multiplier (empire-wide, always evaluated) stays neutral
  // and these tests isolate only the multiplier they're actually about.
  const warIndustryTiles = (ownerId: string) => [
    { x: 2, y: 0, ownerId, ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ ownerId, type: "TITANIUM_WEAPONS_FACTORY", status: "active" }) },
    { x: 3, y: 0, ownerId, ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ ownerId, type: "UMBRITE_WEAPONS_FACTORY", status: "active" }) }
  ];

  it("applies attackVsBarbariansMult when previewing an attack on a barbarian tile", () => {
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "barbarian-1", ownershipState: "SETTLED" },
      ...warIndustryTiles("barbarian-1")
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const baseline = attackPreviewResult("player-1", tiles, undefined, message, [], []);
    const boosted = attackPreviewResult("player-1", tiles, undefined, message, [], ["supply-raiding"]);

    expect(baseline.atkMult).toBe(1);
    expect(boosted.atkMult).toBeCloseTo(1.5, 6);
    expect((boosted.winChance as number)).toBeGreaterThan(baseline.winChance as number);
  });

  it("does not apply attackVsBarbariansMult when the target is not a barbarian", () => {
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...warIndustryTiles("player-2")
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const preview = attackPreviewResult("player-1", tiles, undefined, message, [], ["supply-raiding"]);

    expect(preview.atkMult).toBe(1);
  });

  it("applies the target's active fort defense bonus", () => {
    const fortJson = JSON.stringify({ ownerId: "player-2", status: "active", variant: "FORT" });
    const tilesWithFort = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED", fortJson },
      ...warIndustryTiles("player-1")
    ];
    const tilesWithoutFort = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...warIndustryTiles("player-1")
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const withFort = attackPreviewResult("player-1", tilesWithFort, undefined, message, [], []);
    const withoutFort = attackPreviewResult("player-1", tilesWithoutFort, undefined, message, [], []);

    expect(withFort.defMult).toBeCloseTo(1.3 * 2.5, 6);
    expect(withoutFort.defMult).toBeCloseTo(1.3, 6);
    expect((withFort.winChance as number)).toBeLessThan(withoutFort.winChance as number);
  });

  it("ignores a fort that is not active or not owned by the defender", () => {
    const inactiveFortJson = JSON.stringify({ ownerId: "player-2", status: "under_construction", variant: "FORT" });
    const wrongOwnerFortJson = JSON.stringify({ ownerId: "player-3", status: "active", variant: "FORT" });
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const inactivePreview = attackPreviewResult(
      "player-1",
      [
        { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED", fortJson: inactiveFortJson },
        ...warIndustryTiles("player-1")
      ],
      undefined,
      message,
      [],
      []
    );
    const wrongOwnerPreview = attackPreviewResult(
      "player-1",
      [
        { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED", fortJson: wrongOwnerFortJson },
        ...warIndustryTiles("player-1")
      ],
      undefined,
      message,
      [],
      []
    );

    expect(inactivePreview.defMult).toBeCloseTo(1.3, 6);
    expect(wrongOwnerPreview.defMult).toBeCloseTo(1.3, 6);
  });

  it("doubles the defender's defMult when the attacker has no war industry, and clears once both factory types exist", () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    const buildTiles = (attackerFactories: ReturnType<typeof warIndustryTiles>) => [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...attackerFactories
    ];

    const noWarIndustry = attackPreviewResult("player-1", buildTiles([]), undefined, message, [], []);
    const bothFactoryTypes = attackPreviewResult("player-1", buildTiles(warIndustryTiles("player-1")), undefined, message, [], []);

    expect(noWarIndustry.defMult).toBeCloseTo(1.3 * 2.0, 6);
    expect(bothFactoryTypes.defMult).toBeCloseTo(1.3, 6);
  });

  // Regression: breaking an alliance immediately drops the shared ally
  // vision that used to cover the target's whole territory (see
  // player-snapshot.ts's addVisionForPlayer), so the attacker's own
  // subscription snapshot can lose sight of a factory tile deep in the
  // target's territory well before the target itself notices. Without an
  // authoritative getPlayerFactoryCounts lookup, the preview would fall
  // back to scanning the attacker's now-incomplete tileMap and wrongly
  // apply the "missing war industry" penalty against a target that
  // actually has both factories.
  it("does not apply the no-war-industry penalty when the defender's factory tiles are outside the attacker's vision but getPlayerFactoryCounts reports them", () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    // The attacker's own tileMap only carries the target's border tile —
    // the ex-ally's interior factory tiles have fallen out of vision.
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" }
    ];
    const getPlayerFactoryCounts = (playerId: string) =>
      playerId === "player-2" ? { titanium: 1, umbrite: 1 } : undefined;

    const withoutAuthoritativeCounts = attackPreviewResult("player-1", tiles, undefined, message, [], []);
    const withAuthoritativeCounts = attackPreviewResult(
      "player-1",
      tiles,
      undefined,
      message,
      [],
      [],
      undefined,
      getPlayerFactoryCounts
    );

    expect(withoutAuthoritativeCounts.atkMult).toBeCloseTo(2.0, 6);
    expect(withAuthoritativeCounts.atkMult).toBeCloseTo(1.0, 6);
  });

  // Regression: makeGetPlayerFactoryCounts must prefer the O(1)
  // player.weaponsFactoryCounts field (populated once per snapshot build
  // from the runtime's authoritative owned-structure index -- see
  // player-snapshot.ts) over re-scanning and JSON-parsing every tile in
  // that player's subscription snapshot. Proven here by a snapshot whose
  // tiles disagree with its player.weaponsFactoryCounts field: the field
  // must win.
  it("makeGetPlayerFactoryCounts reads the O(1) player.weaponsFactoryCounts field instead of re-scanning tiles", () => {
    const snapshotForPlayer = (playerId: string) =>
      playerId === "player-2"
        ? {
            tiles: [], // no factory tiles at all -- a tile scan would report {0, 0}
            player: { techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 3, umbrite: 2 } }
          }
        : undefined;

    expect(makeGetPlayerFactoryCounts(snapshotForPlayer)("player-2")).toEqual({ titanium: 3, umbrite: 2 });
  });

  it("makeGetPlayerFactoryCounts falls back to scanning tiles when player.weaponsFactoryCounts is absent", () => {
    const snapshotForPlayer = () => ({
      tiles: warIndustryTiles("player-2"),
      player: { techIds: [], domainIds: [] }
    });

    expect(makeGetPlayerFactoryCounts(snapshotForPlayer)("player-2")).toEqual({ titanium: 1, umbrite: 1 });
  });
});
