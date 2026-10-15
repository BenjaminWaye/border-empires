import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { applyServerReachUpdate, clearServerReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { setIncursionBreachStyle } from "../client-reach-incursion/client-incursion-breach-style.js";
import {
  EMPTY_MAP_3D_REBUILD_TRIGGERS,
  captureMap3DRebuildTriggers,
  map3DRebuildTriggersChanged,
  reach3DRebuildKey
} from "./client-map-3d-rebuild-triggers.js";

type TriggerState = Parameters<typeof captureMap3DRebuildTriggers>[0];

const keyFor = (x: number, y: number): string => `${x},${y}`;

const createState = (): TriggerState => ({
  me: "me",
  tiles: new Map(),
  capture: undefined,
  outgoingMusterAttacksByTile: new Map(),
  incomingAttacksByTile: new Map(),
  crystalTargeting: { active: false, ability: "aether_bridge", validTargets: new Set(), originByTarget: new Map() },
  serverReach: undefined,
  serverReachRevision: 0,
  selected: undefined,
  tileActionMenu: { visible: false, x: 0, y: 0, mode: "single", bulkKeys: [], currentTileKey: "", activeTab: "overview", scrollTopByTab: {}, renderSignature: "" },
  tilesRevision: 0,
  allies: [],
  dormantStructures: [],
  aetherShieldTowers: undefined
});

describe("3D map rebuild triggers", () => {
  // The login bug: the first rebuild runs during renderer creation, before
  // setTrue3DRendererActive(true), so it built no reach. Nothing else changed
  // for an idle player with a still camera, so the border never appeared.
  it("asks for a rebuild once the true-3D renderer becomes active after an inactive first rebuild", () => {
    const state = createState();
    const builtWhileInactive = captureMap3DRebuildTriggers(state, keyFor, false);
    expect(map3DRebuildTriggersChanged(EMPTY_MAP_3D_REBUILD_TRIGGERS, builtWhileInactive)).toBe(false);
    const nowActive = captureMap3DRebuildTriggers(state, keyFor, true);
    expect(map3DRebuildTriggersChanged(builtWhileInactive, nowActive)).toBe(true);
    expect(map3DRebuildTriggersChanged(nowActive, captureMap3DRebuildTriggers(state, keyFor, true))).toBe(false);
  });

  it("asks for a rebuild when a REACH_UPDATE replaces the server reach, including the first one", () => {
    const state = createState();
    const built = captureMap3DRebuildTriggers(state, keyFor, true);
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 1 });
    const afterFirst = captureMap3DRebuildTriggers(state, keyFor, true);
    expect(map3DRebuildTriggersChanged(built, afterFirst)).toBe(true);
    applyServerReachUpdate(state, { tileKeys: ["1,1", "1,2"], revision: 2 });
    expect(map3DRebuildTriggersChanged(afterFirst, captureMap3DRebuildTriggers(state, keyFor, true))).toBe(true);
  });

  it("treats a reconnect's restarted revision 1 as a new reach set", () => {
    const state = createState();
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 1 });
    const before = reach3DRebuildKey(true, state);
    clearServerReach(state);
    applyServerReachUpdate(state, { tileKeys: ["1,1"], revision: 1 });
    expect(reach3DRebuildKey(true, state)).not.toBe(before);
  });

  it("ignores tilesRevision so off-window tile churn cannot force full terrain rebuilds", () => {
    const state = { ...createState(), tilesRevision: 1 };
    const before = reach3DRebuildKey(true, state);
    state.tilesRevision = 2;
    expect(reach3DRebuildKey(true, state)).toBe(before);
  });

  it("drops the reach key while the renderer is inactive so the cache is cleared and rebuilt on reactivation", () => {
    const state = createState();
    expect(reach3DRebuildKey(false, state)).toBe("");
    expect(reach3DRebuildKey(true, state)).not.toBe("");
  });

  it("asks for a rebuild when the admin breach edge style changes, so the pocket outlines redraw without a pan", () => {
    const state = createState();
    setIncursionBreachStyle("straight");
    const built = captureMap3DRebuildTriggers(state, keyFor, true);
    setIncursionBreachStyle("ember");
    const afterSwitch = captureMap3DRebuildTriggers(state, keyFor, true);
    expect(map3DRebuildTriggersChanged(built, afterSwitch)).toBe(true);
    expect(map3DRebuildTriggersChanged(afterSwitch, captureMap3DRebuildTriggers(state, keyFor, true))).toBe(false);
    setIncursionBreachStyle("straight");
  });

  it("still asks for a rebuild on crystal-targeting toggles", () => {
    const state = createState();
    const built = captureMap3DRebuildTriggers(state, keyFor, true);
    state.crystalTargeting.active = true;
    expect(map3DRebuildTriggersChanged(built, captureMap3DRebuildTriggers(state, keyFor, true))).toBe(true);
  });

  it("asks for a rebuild when an Aether Tower is selected, so its protection field shows without a pan", () => {
    const state = createState();
    state.tiles.set("4,4", { x: 4, y: 4, terrain: "LAND", ownerId: "enemy", observatory: { ownerId: "enemy", status: "active" } });
    const built = captureMap3DRebuildTriggers(state, keyFor, true);
    state.selected = { x: 4, y: 4 };
    const afterSelect = captureMap3DRebuildTriggers(state, keyFor, true);
    expect(map3DRebuildTriggersChanged(built, afterSelect)).toBe(true);
    expect(map3DRebuildTriggersChanged(afterSelect, captureMap3DRebuildTriggers(state, keyFor, true))).toBe(false);
  });

  it("asks for a rebuild when a shown tower comes off cooldown, which carries no tile delta of its own", () => {
    const state = createState();
    const cooldownUntil = Date.now() + 60_000;
    state.tiles.set("4,4", { x: 4, y: 4, terrain: "LAND", ownerId: "enemy", observatory: { ownerId: "enemy", status: "active", cooldownUntil } });
    state.crystalTargeting.active = true;
    const built = captureMap3DRebuildTriggers(state, keyFor, true);
    vi.useFakeTimers();
    vi.setSystemTime(cooldownUntil + 1);
    try {
      expect(map3DRebuildTriggersChanged(built, captureMap3DRebuildTriggers(state, keyFor, true))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// client-map-3d.ts needs a full WebGL renderer to construct, so verify the
// wiring by reading the source, as client-map-3d-reach-overlay-throttle-regression.test.ts does.
describe("client-map-3d maybeRebuild reach trigger wiring", () => {
  const source = readFileSync(new URL("../client-map-3d/client-map-3d.ts", import.meta.url), "utf8");
  const fnAt = source.indexOf("const maybeRebuild = (nowMs: number): void =>");
  const block = source.slice(fnAt, source.indexOf("const renderLoop = (): void =>", fnAt));

  it("captures triggers with the live renderer-active flag and includes them in rebuildNeeded", () => {
    expect(fnAt).toBeGreaterThan(-1);
    expect(block).toContain("captureMap3DRebuildTriggers(deps.state, deps.keyFor, isTrue3DRendererActive())");
    const neededAt = block.indexOf("const rebuildNeeded =");
    const changedAt = block.indexOf("map3DRebuildTriggersChanged(lastRebuild.triggers, triggersNow)");
    expect(changedAt).toBeGreaterThan(neededAt);
    expect(changedAt).toBeLessThan(block.indexOf("if (rebuildNeeded"));
  });

  it("snapshots the triggers only when a rebuild commits", () => {
    const commitAt = block.indexOf("rebuildVisibleTerrain(builtWindow)");
    expect(block.indexOf("lastRebuild.triggers = triggersNow")).toBeGreaterThan(commitAt);
  });
});
