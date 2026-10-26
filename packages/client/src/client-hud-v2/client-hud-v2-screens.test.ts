import type { PersonalActivityCard } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveView, TechInfo, Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { parseWinPct } from "./client-hud-v2-battle.js";
import { closeUpOn, endCloseUp, TOWN_ZOOM } from "./client-hud-v2-camera.js";
import { cardCounterparties, chronicleGroups, dayHeading } from "./client-hud-v2-chronicle.js";
import { diplomacyEmpires, empireStance } from "./client-hud-v2-diplomacy.js";
import { manifestLayout, manifestNodeState, nextManifestCost } from "./client-hud-v2-manifest.js";
import { closestPath, leaderShare, selfShare } from "./client-hud-v2-ranks.js";
import { shouldAutoExpand } from "./client-hud-v2-tile-dock.js";
import { townBuildCategories, townScreenRegions } from "./client-hud-v2-town.js";

const tech = (id: string, tier: number, branch: string, prereqIds: string[] = [], gold = 40): TechInfo => ({
  id,
  name: id,
  tier,
  branch,
  prereqIds,
  description: "",
  mods: {},
  requirements: { gold, resources: {} }
});

describe("manifest tree", () => {
  const techs = [tech("a", 1, "economy"), tech("b", 2, "economy", ["a"]), tech("c", 2, "war"), tech("d", 3, "war", ["c", "x"])];

  it("marks commissioned, available and locked from prerequisites", () => {
    const owned = new Set(["a"]);
    expect(techs.map((t) => manifestNodeState(t, owned))).toEqual(["owned", "available", "available", "locked"]);
  });

  it("puts each lane in its own band and folds closed lanes to one row", () => {
    const open = manifestLayout(techs, new Set(), new Set());
    expect(open.lanes.map((l) => l.branch)).toEqual(["economy", "war"]);
    expect(open.nodes.get("b")?.y).toBe(open.nodes.get("a")?.y);
    expect(open.nodes.get("c")!.y).toBeGreaterThan(open.nodes.get("a")!.y);
    const closed = manifestLayout(techs, new Set(), new Set(["economy"]));
    expect(closed.nodes.has("a")).toBe(false);
    expect(closed.lanes[0]).toMatchObject({ closed: true, total: 2 });
  });

  it("lights connectors on the taken path", () => {
    const layout = manifestLayout(techs, new Set(["a", "b"]), new Set());
    expect(layout.segments.every((s) => s.tone === "owned" || s.tone === "locked")).toBe(true);
    expect(layout.segments.some((s) => s.tone === "owned")).toBe(true);
  });

  it("prices the next Manifest from any not yet owned", () => {
    expect(nextManifestCost(techs, new Set(["a"]))).toBe(40);
    expect(nextManifestCost([techs[0]!], new Set(["a"]))).toBeUndefined();
  });
});

const objective = (over: Partial<SeasonVictoryObjectiveView>): SeasonVictoryObjectiveView => ({
  id: "TOWN_CONTROL",
  name: "Town Control",
  description: "",
  leaderName: "Ash",
  leaderPlayerId: "ash",
  progressLabel: "",
  thresholdLabel: "",
  holdDurationSeconds: 86_400,
  statusLabel: "",
  conditionMet: false,
  ...over
});

describe("ranks race", () => {
  it("places the leader at their progress, or on the line once they hold", () => {
    expect(leaderShare(objective({ progress: 0.4 }))).toBe(0.4);
    expect(leaderShare(objective({ progress: 0.4, conditionMet: true }))).toBe(1);
    expect(leaderShare(objective({}))).toBeUndefined();
  });

  it("uses your own progress, or the leader's when you lead", () => {
    expect(selfShare(objective({ selfProgress: 0.2 }), "me")).toBe(0.2);
    expect(selfShare(objective({ leaderPlayerId: "me", progress: 0.7 }), "me")).toBe(0.7);
  });

  it("finds your closest path", () => {
    const paths = [objective({ id: "TOWN_CONTROL", selfProgress: 0.2 }), objective({ id: "MARITIME_SUPREMACY", name: "Maritime", selfProgress: 0.46 })];
    expect(closestPath(paths, "me")?.id).toBe("MARITIME_SUPREMACY");
  });
});

describe("chronicle", () => {
  const now = new Date(2026, 9, 26, 12).getTime();
  const cards: PersonalActivityCard[] = [
    { kind: "COMBAT_GROUP", id: "a", occurredAt: now - 3_600_000, role: "ATTACKER", counterpartyPlayerId: "maren", attempts: 3, captures: 2, originsSeized: 0, manpowerLoss: 10, pillagedGold: 0, defenderGoldLoss: 0, x: 1, y: 1 },
    { kind: "SIEGE", id: "b", occurredAt: now - 30 * 3_600_000, startedAt: now - 31 * 3_600_000, x: 2, y: 2, outcome: "HOLDING", assaultsRepelled: 2, originsSeized: 0, attackerIds: ["kara"], manpowerSpentAgainst: 20 },
    { kind: "BUILDING_COMPLETED", id: "c", occurredAt: now - 60_000, x: 3, y: 3, structureType: "FORT" }
  ];

  it("knows which rivals a card involves", () => {
    expect(cards.map((c) => cardCounterparties(c, "me"))).toEqual([["maren"], ["kara"], []]);
  });

  it("groups newest first by day and filters by rival", () => {
    const groups = chronicleGroups(cards, "me", "", now);
    expect(groups.map((g) => g.heading)).toEqual(["TODAY", "YESTERDAY"]);
    expect(groups[0]?.cards.map((c) => c.id)).toEqual(["c", "a"]);
    expect(chronicleGroups(cards, "me", "kara", now).flatMap((g) => g.cards.map((c) => c.id))).toEqual(["b"]);
    expect(dayHeading(now - 3 * 86_400_000, now)).toMatch(/^[A-Z]{3} \d+$/);
  });
});

describe("diplomacy list", () => {
  it("orders truces, then allies, then everyone else by tiles", () => {
    const input = {
      me: "me",
      metPlayerIds: new Set(["a", "b", "c", "d"]),
      allies: ["b"],
      activeTruces: [{ otherPlayerId: "c", otherPlayerName: "c", startedAt: 0, endsAt: 9 * 3_600_000, createdByPlayerId: "me" }],
      incomingAlliance: [],
      incomingTruce: [],
      leaderboard: [{ id: "a", name: "a", tiles: 10, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 0, rank: 2 }, { id: "d", name: "d", tiles: 50, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 0, rank: 1 }],
      nameOf: (id: string) => id.toUpperCase(),
      colorOf: () => undefined,
      nowMs: 0
    };
    expect(diplomacyEmpires(input).map((e) => e.id)).toEqual(["c", "b", "d", "a"]);
    expect(empireStance("c", input)).toEqual({ kind: "truce", label: "Truce 9h" });
  });
});

const view = (over: Partial<TileMenuView>): TileMenuView => ({ title: "Halveth (5, 5)", subtitle: "", tabs: ["actions"], overviewLines: [], actions: [], buildings: [], crystal: [], ...over });
const act = (id: TileActionDef["id"], over: Partial<TileActionDef> = {}): TileActionDef => ({ id, label: id, ...over });

describe("town screen", () => {
  const town: Tile = {
    x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    town: { name: "Halveth", type: "MARKET", baseGoldPerMinute: 1, supportCurrent: 6, supportMax: 8, goldPerMinute: 1, cap: 0, isFed: true, population: 50, maxPopulation: 100, populationTier: "TOWN", connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false }
  };
  const support: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };

  it("runs town actions on the town and builds on the selected support tile", () => {
    const regions = townScreenRegions({
      town,
      focus: support,
      townView: view({ actions: [act("grow_town_to_city", { label: "Upgrade to City" }), act("muster_hold")] }),
      focusView: view({ buildings: [act("build_hydrogarden", { label: "Hydrogarden" })] }),
      townIndex: 0,
      townCount: 1,
      buildSelection: "build_hydrogarden",
      category: undefined
    });
    expect(regions.left).toContain('data-hud-v2-action="grow_town_to_city" data-target-key="5,5"');
    expect(regions.bar).toContain('data-hud-v2-action="muster_hold" data-target-key="5,5"');
    expect(regions.place).toContain('data-target-key="6,5"');
    expect(regions.place).toContain("Build on (6, 5)");
  });

  it("only lists categories that have something to build", () => {
    expect(townBuildCategories([act("build_hydrogarden"), act("build_fortification")]).every((c) => c.count > 0)).toBe(true);
  });
});

describe("battle and neutral expand", () => {
  it("reads the win chance off the effort sheet line", () => {
    expect(parseWinPct("Win chance 62% · costs 120 manpower")).toBe(62);
    expect(parseWinPct("Win chance shown once the target borders you")).toBeUndefined();
  });

  it("claims neutral land touching yours on the click, and nothing else", () => {
    const tiles = new Map<string, Tile>([["4,5", { x: 4, y: 5, terrain: "LAND", ownerId: "me" }]]);
    const neutral: Tile = { x: 5, y: 5, terrain: "LAND" };
    const expand = { actions: [act("settle_land", { label: "Expand To" })] };
    expect(shouldAutoExpand({ tiles, me: "me" }, neutral, expand)).toBe(true);
    expect(shouldAutoExpand({ tiles, me: "me" }, { x: 9, y: 9, terrain: "LAND" }, expand)).toBe(false);
    expect(shouldAutoExpand({ tiles, me: "me" }, neutral, { actions: [act("settle_land", { label: "Expand To", disabled: true })] })).toBe(false);
    expect(shouldAutoExpand({ tiles, me: "me" }, { ...neutral, ownerId: "them" }, expand)).toBe(false);
  });
});

describe("detail-screen close-up camera", () => {
  const camDeps = () => {
    const state = { zoom: 22, camX: 1, camY: 2, camSubX: 0.5, camSubY: 0.25 };
    return { state, wrapX: (x: number) => x, wrapY: (y: number) => y, requestViewRefresh: () => undefined } as unknown as Parameters<typeof closeUpOn>[0] & { state: typeof state };
  };

  it("zooms in on the tile and returns to the earlier view", () => {
    const deps = camDeps();
    closeUpOn(deps, 30, 40, TOWN_ZOOM);
    expect(deps.state).toMatchObject({ zoom: TOWN_ZOOM, camX: 30, camY: 40, camSubX: 0 });
    closeUpOn(deps, 31, 40, TOWN_ZOOM);
    endCloseUp(deps);
    expect(deps.state).toMatchObject({ zoom: 22, camX: 1, camY: 2, camSubX: 0.5 });
  });

  it("never zooms out to reach the close-up, and can stay on the tile", () => {
    const deps = camDeps();
    deps.state.zoom = 150;
    closeUpOn(deps, 30, 40, TOWN_ZOOM);
    expect(deps.state.zoom).toBe(150);
    endCloseUp(deps, true);
    expect(deps.state).toMatchObject({ zoom: 150, camX: 30, camY: 40 });
  });
});
