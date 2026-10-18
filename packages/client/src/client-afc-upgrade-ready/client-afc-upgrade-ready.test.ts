// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { createAfcJoinDropState } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import type { DomainInfo, Tile } from "../client-types.js";
import { createAfcUpgradeReadyBadges, readyAfcUpgradeCount, shouldShowAfcUpgradeReadyBadge } from "./client-afc-upgrade-ready.js";

const upgrade = (id: string, tier = 1): DomainInfo => ({
  id, tier, name: id, description: "Test upgrade", requiresTechId: "trade", mods: {},
  requirements: { gold: 40, resources: { SHARD: 1 }, canResearch: false }
});
const state = () => {
  const value = createInitialState();
  value.me = "me";
  value.techIds = ["trade"];
  value.gold = 40;
  value.strategicResources.SHARD = 1;
  value.domainCatalog = [upgrade("a"), upgrade("b")];
  value.domainChoices = ["a", "b"];
  return value;
};
const afc = (): Tile => ({
  x: 2, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  afc: { ownerId: "me", status: "active", modules: [] }
});

describe("AFC upgrade readiness", () => {
  it("counts choices by tier and uses current balances instead of stale INIT affordability", () => {
    const value = state();
    expect(readyAfcUpgradeCount(value)).toBe(1);
    value.gold = 39;
    expect(readyAfcUpgradeCount(value)).toBe(0);
    value.gold = 40;
    value.strategicResources.SHARD = 0;
    expect(readyAfcUpgradeCount(value)).toBe(0);
  });
  it("does not offer another choice in a filled tier or advertise pending installation", () => {
    const value = state();
    value.domainIds = ["a"];
    expect(readyAfcUpgradeCount(value)).toBe(0);
    value.domainIds = [];
    value.pendingDomainUnlockId = "a";
    expect(readyAfcUpgradeCount(value)).toBe(0);
  });
  it("requires a reachable choice, owned prerequisite and player identity", () => {
    const value = state();
    value.techIds = [];
    expect(readyAfcUpgradeCount(value)).toBe(0);
    value.techIds = ["trade"];
    value.domainChoices = [];
    expect(readyAfcUpgradeCount(value)).toBe(0);
    value.domainChoices = ["a"];
    value.me = "";
    expect(readyAfcUpgradeCount(value)).toBe(0);
  });
  it("handles a free choice at zero balance", () => {
    const value = state();
    value.gold = 0;
    value.strategicResources.SHARD = 0;
    value.domainCatalog[0]!.requirements = { gold: 0, resources: {} };
    expect(readyAfcUpgradeCount(value)).toBe(1);
  });
  it("only marks a visible active AFC owned by the viewer, after its landing", () => {
    const tile = afc();
    const drop = createAfcJoinDropState();
    expect(shouldShowAfcUpgradeReadyBadge(tile, "me", 1, drop)).toBe(true);
    expect(shouldShowAfcUpgradeReadyBadge(tile, "other", 1, drop)).toBe(false);
    expect(shouldShowAfcUpgradeReadyBadge(tile, "me", 0, drop)).toBe(false);
    expect(shouldShowAfcUpgradeReadyBadge(undefined, "me", 1, drop)).toBe(false);
    drop.x = 2; drop.y = 3; drop.phase = "waiting";
    expect(shouldShowAfcUpgradeReadyBadge(tile, "me", 1, drop)).toBe(false);
    drop.phase = "done";
    tile.afc!.status = "inactive";
    expect(shouldShowAfcUpgradeReadyBadge(tile, "me", 1, drop)).toBe(false);
  });
});

describe("projected AFC upgrade badge", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="surface"><canvas></canvas></div>'; });
  const canvasForTest = (): HTMLCanvasElement => {
    const canvas = document.querySelector("canvas")!;
    canvas.width = 1600; canvas.height = 1200;
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    return canvas;
  };
  it("follows projection and pixel scaling, opens directly, and clears immediately when claimed", () => {
    const open = vi.fn();
    const badges = createAfcUpgradeReadyBadges(canvasForTest(), open);
    const position = { key: "2,3", x: 2, y: 3, screenX: 800, screenY: 400 };
    badges.render([position], 1);
    const button = document.querySelector<HTMLButtonElement>(".afc-upgrade-ready-badge")!;
    expect(button.style.left).toBe("400px");
    expect(button.style.top).toBe("200px");
    expect(button.textContent).toBe("↑ 1 upgrade ready");
    button.click(); expect(open).toHaveBeenCalledTimes(1);
    badges.render([{ ...position, screenX: 1000, screenY: 600 }], 2);
    expect(document.querySelector("button")).toBe(button);
    expect(button.style.left).toBe("500px");
    expect(button.textContent).toBe("↑ 2 upgrades ready");
    badges.render([position], 0);
    expect(document.querySelector("button")).toBeNull();
    badges.dispose(); expect(document.querySelector(".afc-upgrade-ready-layer")).toBeNull();
  });
  it("does not retain offscreen, fogged, captured or no-longer-visible markers", () => {
    const badges = createAfcUpgradeReadyBadges(canvasForTest(), vi.fn());
    badges.render([{ key: "2,3", x: 2, y: 3, screenX: 800, screenY: 400 }], 1);
    badges.render([], 1);
    expect(document.querySelectorAll("button")).toHaveLength(0);
    badges.render([{ key: "2,3", x: 2, y: 3, screenX: Infinity, screenY: 400 }], 1);
    expect(document.querySelectorAll("button")).toHaveLength(0);
    badges.dispose();
  });
  it("keeps a ready count in global navigation even when the AFC is offscreen", () => {
    document.body.insertAdjacentHTML("beforeend", '<button data-panel="domains">AFC Upgrades</button><button data-mobile-panel="domains">AFC Upgrades</button><button data-open-afc-upgrades>Manage AFC upgrades</button>');
    const open = vi.fn();
    const badges = createAfcUpgradeReadyBadges(canvasForTest(), open);
    badges.render([], 2);
    expect(document.querySelectorAll('[data-afc-upgrade-ready="2"]')).toHaveLength(2);
    document.querySelector<HTMLButtonElement>("[data-open-afc-upgrades]")!.click();
    expect(open).toHaveBeenCalledTimes(1);
    badges.render([], 0);
    expect(document.querySelectorAll("[data-afc-upgrade-ready]")).toHaveLength(0);
    badges.dispose();
    document.querySelector<HTMLButtonElement>("[data-open-afc-upgrades]")!.click();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
