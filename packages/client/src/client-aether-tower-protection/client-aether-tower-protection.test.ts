import { describe, expect, it } from "vitest";
import { OBSERVATORY_PROTECTION_RADIUS, WORLD_WIDTH } from "@border-empires/shared";
import {
  AETHER_PROTECTION_ENEMY_COLOR,
  AETHER_PROTECTION_FRIENDLY_COLOR,
  aetherProtectionColor,
  aetherProtectionField,
  aetherProtectionFieldKey,
  isAetherProtectionFieldShown,
  tileAetherProtection
} from "./client-aether-tower-protection.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const NOW = 1_700_000_000_000;

type FieldState = Parameters<typeof aetherProtectionField>[0];
type ShownState = Parameters<typeof isAetherProtectionFieldShown>[0];

let revision = 0;
const fieldState = (tiles: Tile[], overrides: Partial<FieldState> = {}): FieldState => ({
  tiles: new Map(tiles.map((tile) => [keyFor(tile.x, tile.y), tile])),
  // Each fixture gets its own revision so the module's one-entry memo never serves a stale scan.
  tilesRevision: ++revision,
  me: "me",
  allies: [],
  dormantStructures: [],
  ...overrides
});

const tower = (x: number, y: number, ownerId: string, observatory: Partial<NonNullable<Tile["observatory"]>> = {}): Tile => ({
  x, y, terrain: "LAND", ownerId, observatory: { ownerId, status: "active", ...observatory }
});
const land = (x: number, y: number, ownerId?: string): Tile => ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId } : {}) });

const shownState = (overrides: Partial<ShownState> = {}): ShownState => ({
  selected: undefined,
  tiles: new Map(),
  tileActionMenu: { visible: false, x: 0, y: 0, mode: "single", bulkKeys: [], currentTileKey: "", activeTab: "overview", scrollTopByTab: {}, renderSignature: "" },
  crystalTargeting: { active: false, ability: "aether_bridge", validTargets: new Set(), originByTarget: new Map() } as ShownState["crystalTargeting"],
  ...overrides
});

describe("isAetherProtectionFieldShown", () => {
  it("is hidden by default", () => {
    expect(isAetherProtectionFieldShown(shownState(), keyFor)).toBe(false);
  });

  it("shows while any visible Aether Tower is selected -- yours or an enemy's", () => {
    for (const ownerId of ["me", "enemy"]) {
      const tiles = new Map([["3,3", tower(3, 3, ownerId)]]);
      expect(isAetherProtectionFieldShown(shownState({ tiles, selected: { x: 3, y: 3 } }), keyFor)).toBe(true);
    }
  });

  it("stays hidden for a selected tile without a tower, or a fogged remembered tower", () => {
    const tiles = new Map([["1,1", land(1, 1, "me")], ["3,3", { ...tower(3, 3, "enemy"), fogged: true }]]);
    expect(isAetherProtectionFieldShown(shownState({ tiles, selected: { x: 1, y: 1 } }), keyFor)).toBe(false);
    expect(isAetherProtectionFieldShown(shownState({ tiles, selected: { x: 3, y: 3 } }), keyFor)).toBe(false);
  });

  it("shows while the tile menu's Aether (crystal) tab is open on any tile", () => {
    const base = shownState();
    const menu = { ...base.tileActionMenu, visible: true, activeTab: "crystal" as const };
    expect(isAetherProtectionFieldShown({ ...base, tileActionMenu: menu }, keyFor)).toBe(true);
    expect(isAetherProtectionFieldShown({ ...base, tileActionMenu: { ...menu, activeTab: "actions" } }, keyFor)).toBe(false);
    expect(isAetherProtectionFieldShown({ ...base, tileActionMenu: { ...menu, visible: false } }, keyFor)).toBe(false);
  });

  it("shows while aiming an Aether ability", () => {
    const base = shownState();
    expect(isAetherProtectionFieldShown({ ...base, crystalTargeting: { ...base.crystalTargeting, active: true } }, keyFor)).toBe(true);
  });
});

describe("aetherProtectionField / tileAetherProtection", () => {
  it("shields only the tower owner's tiles within the protection radius (server rule)", () => {
    const r = OBSERVATORY_PROTECTION_RADIUS;
    const state = fieldState([tower(50, 50, "enemy"), land(50 + r, 50 - r, "enemy"), land(50 + r + 1, 50, "enemy"), land(51, 50, "third"), land(52, 50)]);
    const field = aetherProtectionField(state, NOW);
    expect(tileAetherProtection(land(50, 50, "enemy"), field)?.relation).toBe("enemy");
    expect(tileAetherProtection(land(50 + r, 50 - r, "enemy"), field)).toBeDefined();
    expect(tileAetherProtection(land(50 + r + 1, 50, "enemy"), field)).toBeUndefined();
    expect(tileAetherProtection(land(51, 50, "third"), field)).toBeUndefined();
    expect(tileAetherProtection(land(52, 50), field)).toBeUndefined();
    expect(tileAetherProtection(undefined, field)).toBeUndefined();
  });

  it("measures the radius across the world's wrap seam", () => {
    const field = aetherProtectionField(fieldState([tower(0, 10, "enemy")]), NOW);
    expect(tileAetherProtection(land(WORLD_WIDTH - 1, 10, "enemy"), field)).toBeDefined();
  });

  it("tags your own and allied towers friendly, everyone else's enemy", () => {
    const field = aetherProtectionField(fieldState([tower(10, 10, "me"), tower(100, 100, "ally"), tower(200, 200, "enemy")], { allies: ["ally"] }), NOW);
    expect(tileAetherProtection(land(10, 11, "me"), field)?.relation).toBe("friendly");
    expect(tileAetherProtection(land(100, 101, "ally"), field)?.relation).toBe("friendly");
    expect(tileAetherProtection(land(200, 201, "enemy"), field)?.relation).toBe("enemy");
    expect(aetherProtectionColor("friendly")).toBe(AETHER_PROTECTION_FRIENDLY_COLOR);
    expect(aetherProtectionColor("enemy")).toBe(AETHER_PROTECTION_ENEMY_COLOR);
  });

  it("leaves out towers that aren't shielding right now", () => {
    const field = aetherProtectionField(
      fieldState(
        [
          tower(10, 10, "enemy", { cooldownUntil: NOW + 1_000 }), // on cooldown
          tower(60, 60, "enemy", { status: "under_construction" }),
          { ...tower(110, 110, "enemy"), fogged: true }, // remembered, not currently seen
          { ...tower(160, 160, "enemy"), ownerId: "captor" }, // captured tile: tower owner no longer holds it
          tower(210, 210, "me") // own tower gone dormant (resource slot)
        ],
        { dormantStructures: [{ key: "210,210:observatory", resources: ["CRYSTAL"] }] }
      ),
      NOW
    );
    expect(aetherProtectionFieldKey(field)).toBe("");
  });

  it("includes a tower once its cooldown has passed", () => {
    const state = fieldState([tower(10, 10, "enemy", { cooldownUntil: NOW + 1_000 })]);
    expect(aetherProtectionFieldKey(aetherProtectionField(state, NOW))).toBe("");
    expect(aetherProtectionFieldKey(aetherProtectionField(state, NOW + 1_000))).toBe("10,10:enemy");
  });

  it("rescans when tilesRevision moves, so a newly finished tower is picked up", () => {
    const state = fieldState([tower(10, 10, "enemy", { status: "under_construction" })]);
    expect(aetherProtectionFieldKey(aetherProtectionField(state, NOW))).toBe("");
    (state.tiles as Map<string, Tile>).set("10,10", tower(10, 10, "enemy"));
    state.tilesRevision += 1;
    expect(aetherProtectionFieldKey(aetherProtectionField(state, NOW))).toBe("10,10:enemy");
  });
});
