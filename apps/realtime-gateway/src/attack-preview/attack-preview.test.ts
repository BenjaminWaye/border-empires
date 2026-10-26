import { describe, expect, it, vi } from "vitest";

import { attackPreviewResult, buildAttackPreviewResponse, makeGetPlayerFactoryCounts, makeGetPlayerTechDomainIds } from "./attack-preview.js";

describe("attackPreviewResult", () => {
  // Both factory types owned by the defender, so the "no war industry"
  // vulnerability multiplier (empire-wide, always evaluated) stays neutral
  // and these tests isolate only the multiplier they're actually about.
  // Titanium (+1.5%) x Umbrite (+3%) attack from one copy of each.
  const ATTACKER_FACTORY_MULT = 1.015 * 1.03;
  const warIndustryTiles = (ownerId: string) => [
    { x: 2, y: 0, ownerId, ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ ownerId, type: "TITANIUM_WEAPONS_FACTORY", status: "active" }) },
    { x: 3, y: 0, ownerId, ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ ownerId, type: "UMBRITE_WEAPONS_FACTORY", status: "active" }) }
  ];

  it("applies attackVsBarbariansMult when previewing an attack on a barbarian tile", async () => {
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "barbarian-1", ownershipState: "SETTLED" },
      ...warIndustryTiles("barbarian-1")
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const baseline = await attackPreviewResult("player-1", tiles, undefined, message, [], []);
    const boosted = await attackPreviewResult("player-1", tiles, undefined, message, [], ["supply-raiding"]);

    expect(baseline.atkMult).toBe(1);
    expect(boosted.atkMult).toBeCloseTo(1.5, 6);
    expect((boosted.winChance as number)).toBeGreaterThan(baseline.winChance as number);
  });

  it("does not apply attackVsBarbariansMult when the target is not a barbarian", async () => {
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...warIndustryTiles("player-2")
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const preview = await attackPreviewResult("player-1", tiles, undefined, message, [], ["supply-raiding"]);

    expect(preview.atkMult).toBe(1);
  });

  it("previews real defense on a freshly captured FRONTIER tile still holding ground, and zero once the hold expires", async () => {
    const tileWith = (captureHoldUntil: number) => [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "FRONTIER", dockId: "dock-1", captureHoldUntil },
      ...warIndustryTiles("player-1"),
      ...warIndustryTiles("player-2")
    ];
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const held = await attackPreviewResult("player-1", tileWith(Date.now() + 60_000), undefined, message, [], []);
    const expired = await attackPreviewResult("player-1", tileWith(Date.now() - 1), undefined, message, [], []);

    expect(held.defMult).toBeGreaterThan(0);
    expect(held.winChance as number).toBeLessThan(1);
    expect(expired.defMult).toBe(0);
    expect(expired.winChance).toBe(1);
  });

  it("applies the target's active fort defense bonus", async () => {
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

    const withFort = await attackPreviewResult("player-1", tilesWithFort, undefined, message, [], []);
    const withoutFort = await attackPreviewResult("player-1", tilesWithoutFort, undefined, message, [], []);

    expect(withFort.defMult).toBeCloseTo(1.3 * 2.5, 6);
    expect(withoutFort.defMult).toBeCloseTo(1.3, 6);
    expect((withFort.winChance as number)).toBeLessThan(withoutFort.winChance as number);
  });

  it("ignores a fort that is not active or not owned by the defender", async () => {
    const inactiveFortJson = JSON.stringify({ ownerId: "player-2", status: "under_construction", variant: "FORT" });
    const wrongOwnerFortJson = JSON.stringify({ ownerId: "player-3", status: "active", variant: "FORT" });
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };

    const inactivePreview = await attackPreviewResult(
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
    const wrongOwnerPreview = await attackPreviewResult(
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

  it("doubles the defender's defMult only for a factory type the defender owns and the attacker lacks", async () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    const titaniumFactory = (ownerId: string, x: number) => ({ x, y: 0, ownerId, ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ ownerId, type: "TITANIUM_WEAPONS_FACTORY", status: "active" }) });
    const buildTiles = (...extra: ReturnType<typeof titaniumFactory>[]) => [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...extra
    ];
    type BattleRow = { label: string; mult: number };
    const battleRows = (side: unknown): BattleRow[] => (side as { battle: BattleRow[] }).battle;

    // Neither side owns a factory: no war-industry bonus either way.
    const neither = await attackPreviewResult("player-1", buildTiles(), undefined, message, [], []);
    expect(neither.atkMult).toBeCloseTo(1, 6);
    expect(neither.defMult).toBeCloseTo(1.3, 6);

    // Regression: attacker with no factories vs a Titanium-only defender.
    // The attacker used to get +100% for the defender's missing Umbrite and
    // the defender's row read "Attacker missing Titanium & Umbrite".
    const titaniumDefender = await attackPreviewResult("player-1", buildTiles(titaniumFactory("player-2", 2)), undefined, message, [], []);
    expect(titaniumDefender.atkMult).toBeCloseTo(1, 6);
    expect(titaniumDefender.defMult).toBeCloseTo(1.3 * 1.03 * 2.0, 6);
    expect(battleRows(titaniumDefender.attacker).some((row) => row.label.includes("Weapons Factory"))).toBe(false);
    expect(battleRows(titaniumDefender.defender).find((row) => row.mult === 2)?.label).toBe("Attacker missing Titanium Weapons Factory");

    // Both own Titanium: neither side holds an edge.
    const bothTitanium = await attackPreviewResult("player-1", buildTiles(titaniumFactory("player-1", -1), titaniumFactory("player-2", 2)), undefined, message, [], []);
    expect(bothTitanium.defMult).toBeCloseTo(1.3 * 1.03, 6);
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
  it("does not apply the no-war-industry penalty when the defender's factory tiles are outside the attacker's vision but getPlayerFactoryCounts reports them", async () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    // The attacker's own tileMap only carries the target's border tile —
    // the ex-ally's interior factory tiles have fallen out of vision.
    // The attacker owns both factory types (read from its own tileMap), so
    // a false "defender is missing factories" reading would show up as a
    // 2x attack edge.
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...warIndustryTiles("player-1")
    ];
    const getPlayerFactoryCounts = async (playerId: string) =>
      playerId === "player-2" ? { titanium: 1, umbrite: 1 } : undefined;

    const withoutAuthoritativeCounts = await attackPreviewResult("player-1", tiles, undefined, message, [], []);
    const withAuthoritativeCounts = await attackPreviewResult(
      "player-1",
      tiles,
      undefined,
      message,
      [],
      [],
      undefined,
      getPlayerFactoryCounts
    );

    expect(withoutAuthoritativeCounts.atkMult).toBeCloseTo(ATTACKER_FACTORY_MULT * 2.0, 6);
    expect(withAuthoritativeCounts.atkMult).toBeCloseTo(ATTACKER_FACTORY_MULT, 6);
  });

  // Regression: a second, still-live gap in the same mechanism as above.
  // playerSubscriptions.snapshotForPlayer evicts a player's cached
  // snapshot the instant their last socket disconnects, so an OFFLINE
  // defender has no cached snapshot at all -- not merely one whose vision
  // has receded. Confirmed live in production: attack previews against an
  // offline opponent fell back all the way to scanning the attacker's own
  // vision-limited tileMap, reproducing the exact false "+100% missing
  // weapons factory" bonus PR #1745 fixed for the ex-ally case. Fixed by
  // having makeGetPlayerFactoryCounts / makeGetPlayerTechDomainIds fall
  // back further to a getPlayerCombatSummary lookup (the lightweight
  // GetPlayerCombatSummary RPC) instead of returning undefined.
  it("does not apply the no-war-industry penalty against an offline defender when getPlayerCombatSummary reports their factories", async () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    // The attacker owns both factory types (read from its own tileMap), so
    // a false "defender is missing factories" reading would show up as a
    // 2x attack edge.
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" },
      ...warIndustryTiles("player-1")
    ];
    // Neither player has a live cached subscription snapshot (both offline).
    const snapshotForPlayer = () => undefined;
    const getPlayerCombatSummary = async (playerId: string) =>
      playerId === "player-2"
        ? { techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 1, umbrite: 1 } }
        : undefined;

    const withoutCombatSummaryFallback = await attackPreviewResult("player-1", tiles, undefined, message, [], []);
    const withCombatSummaryFallback = await attackPreviewResult(
      "player-1",
      tiles,
      undefined,
      message,
      [],
      [],
      makeGetPlayerTechDomainIds(snapshotForPlayer, getPlayerCombatSummary),
      makeGetPlayerFactoryCounts(snapshotForPlayer, getPlayerCombatSummary)
    );

    expect(withoutCombatSummaryFallback.atkMult).toBeCloseTo(ATTACKER_FACTORY_MULT * 2.0, 6);
    expect(withCombatSummaryFallback.atkMult).toBeCloseTo(ATTACKER_FACTORY_MULT, 6);
  });

  it("getPlayerCombatSummary fallback errors are swallowed rather than rejecting the whole preview", async () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" }
    ];
    const snapshotForPlayer = () => undefined;
    const getPlayerCombatSummary = async (): Promise<never> => {
      throw new Error("simulation unreachable");
    };

    const preview = await attackPreviewResult(
      "player-1",
      tiles,
      undefined,
      message,
      [],
      [],
      makeGetPlayerTechDomainIds(snapshotForPlayer, getPlayerCombatSummary),
      makeGetPlayerFactoryCounts(snapshotForPlayer, getPlayerCombatSummary)
    );

    expect(preview.valid).toBe(true);
  });

  // Regression: makeGetPlayerFactoryCounts must prefer the O(1)
  // player.weaponsFactoryCounts field (populated once per snapshot build
  // from the runtime's authoritative owned-structure index -- see
  // player-snapshot.ts) over re-scanning and JSON-parsing every tile in
  // that player's subscription snapshot. Proven here by a snapshot whose
  // tiles disagree with its player.weaponsFactoryCounts field: the field
  // must win.
  it("makeGetPlayerFactoryCounts reads the O(1) player.weaponsFactoryCounts field instead of re-scanning tiles", async () => {
    const snapshotForPlayer = (playerId: string) =>
      playerId === "player-2"
        ? {
            tiles: [], // no factory tiles at all -- a tile scan would report {0, 0}
            player: { techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 3, umbrite: 2 } }
          }
        : undefined;

    expect(await makeGetPlayerFactoryCounts(snapshotForPlayer)("player-2")).toEqual({ titanium: 3, umbrite: 2 });
  });

  it("makeGetPlayerFactoryCounts falls back to scanning tiles when player.weaponsFactoryCounts is absent", async () => {
    const snapshotForPlayer = () => ({
      tiles: warIndustryTiles("player-2"),
      player: { techIds: [], domainIds: [] }
    });

    expect(await makeGetPlayerFactoryCounts(snapshotForPlayer)("player-2")).toEqual({ titanium: 1, umbrite: 1 });
  });

  // Regression: makeGetPlayerTechDomainIds and makeGetPlayerFactoryCounts
  // both independently fall back to getPlayerCombatSummary for the same
  // offline target within a single preview (once for tech/domain ids, once
  // for factory counts). buildAttackPreviewResponse must memoize that
  // lookup per request so a single attack preview against one offline
  // player fires the RPC once, not twice.
  it("buildAttackPreviewResponse calls getPlayerCombatSummary at most once per player per request", async () => {
    const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
    const tiles = [
      { x: 0, y: 0, ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: "player-2", ownershipState: "SETTLED" }
    ];
    const snapshotForPlayer = () => undefined;
    const getPlayerCombatSummary = vi.fn(async (playerId: string) =>
      playerId === "player-2"
        ? { techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 1, umbrite: 1 } }
        : undefined
    );

    await buildAttackPreviewResponse("player-1", { tiles }, snapshotForPlayer, getPlayerCombatSummary, message);

    const callsForPlayerTwo = getPlayerCombatSummary.mock.calls.filter(([pid]) => pid === "player-2");
    expect(callsForPlayerTwo).toHaveLength(1);
  });
});
