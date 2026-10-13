// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { renderOnboardingChecklistOverlay, resetOnboardingChecklistOverlayForTests } from "./client-onboarding-checklist-overlay.js";
import { injectOnboardingRelayBeaconRecommendation, onboardingRelayBeaconSite } from "./client-onboarding-relay-beacon-recommendation.js";

const ME = "me";

// No town in reach: the checklist marks (3,0) -- the owned tile closest to
// the town at (12,0) -- as the Relay Beacon site.
const beaconStepTiles = (): Map<string, Tile> => {
  const tiles: Tile[] = [
    { x: 0, y: 0, terrain: "LAND", ownerId: ME, ownershipState: "SETTLED", townType: "FARMING", townPopulationTier: "SETTLEMENT" },
    { x: 1, y: 0, terrain: "LAND", ownerId: ME, ownershipState: "SETTLED" },
    { x: 3, y: 0, terrain: "LAND", ownerId: ME, ownershipState: "SETTLED" },
    { x: 12, y: 0, terrain: "LAND", townType: "MARKET", townPopulationTier: "TOWN" }
  ];
  return new Map(tiles.map((t) => [tileKey(t.x, t.y), t]));
};

const beaconAction = (): TileActionDef => ({ id: "build_relay_beacon", label: "Build Relay Beacon" });
const menuView = (): TileMenuView => ({
  title: "",
  subtitle: "",
  tabs: ["overview", "actions", "buildings"],
  overviewLines: [],
  actions: [],
  buildings: [beaconAction(), { id: "build_fortification", label: "Build Fort" }],
  crystal: []
});

beforeEach(() => {
  window.localStorage.clear();
  resetOnboardingChecklistOverlayForTests();
});

it("tags Build Relay Beacon as Recommended on the tile the onboarding checklist marks, and nowhere else", () => {
  renderOnboardingChecklistOverlay(beaconStepTiles(), ME, null);
  expect(onboardingRelayBeaconSite()).toEqual({ x: 3, y: 0 });

  const marked = menuView();
  injectOnboardingRelayBeaconRecommendation(marked, { x: 3, y: 0 });
  expect(marked.buildings.find((a) => a.id === "build_relay_beacon")?.recommended).toBe(true);
  expect(marked.buildings.find((a) => a.id === "build_fortification")?.recommended).toBeUndefined();

  // The menu opens on Actions, so the recommended beacon is surfaced there too.
  expect(marked.actions).toEqual([expect.objectContaining({ id: "build_relay_beacon", recommended: true })]);

  const other = menuView();
  injectOnboardingRelayBeaconRecommendation(other, { x: 1, y: 0 });
  expect(other.buildings.find((a) => a.id === "build_relay_beacon")?.recommended).toBeUndefined();
  expect(other.actions).toEqual([]);
});

it("drops the tag once the checklist moves past the Relay Beacon step, or while it is deferred", () => {
  const tiles = beaconStepTiles();
  renderOnboardingChecklistOverlay(tiles, ME, null, true);
  expect(onboardingRelayBeaconSite()).toBeUndefined();

  renderOnboardingChecklistOverlay(tiles, ME, null);
  expect(onboardingRelayBeaconSite()).toEqual({ x: 3, y: 0 });

  // Town now inside reach (radius 3 from the spawn) -> EXPAND_TOWN, no beacon guidance.
  tiles.set(tileKey(2, 0), { x: 2, y: 0, terrain: "LAND", townType: "MARKET", townPopulationTier: "TOWN" });
  renderOnboardingChecklistOverlay(tiles, ME, null);
  expect(onboardingRelayBeaconSite()).toBeUndefined();
  const view = menuView();
  injectOnboardingRelayBeaconRecommendation(view, { x: 3, y: 0 });
  expect(view.buildings[0]?.recommended).toBeUndefined();
});
