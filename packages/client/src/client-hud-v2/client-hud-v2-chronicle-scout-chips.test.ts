// @vitest-environment happy-dom
import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { scoutFindingRingTiles, SCOUT_FINDING_HIGHLIGHT_MS } from "../client-scout-drone/client-scout-finding-highlight.js";
import { screen } from "./client-hud-v2-context.js";
import { chronicleHtml } from "./client-hud-v2-chronicle.js";
import { chronicleScoutFindClick, decodeScoutFindTiles, scoutReportFindsHtml } from "./client-hud-v2-chronicle-scout-chips.js";

// A scout report used to name its finds in one line with a single Show to the
// drone's target, so the town, waystation and grain it found could not be reached.

const base = { kind: "SCOUT_REPORT" as const, id: "scout-1", occurredAt: 500, x: 467, y: 251, docks: 0, watchtowers: 0, planetaryDefenseTiles: 0, empiresSighted: [] as string[] };
const card: PersonalActivityCard = {
  ...base, towns: 1, waystations: 1, resourceTiles: 2,
  resourcesSighted: [{ resource: "FARM", count: 2 }],
  sites: { towns: [{ x: 470, y: 250 }], docks: [], waystations: [{ x: 465, y: 252 }], watchtowers: [], planetaryDefense: [], resources: { FARM: [{ x: 466, y: 249 }, { x: 466, y: 250 }] }, empires: {} }
};
const names = (): string | undefined => undefined;

describe("Chronicle scout report finds", () => {
  it("makes each find its own link carrying that find's tiles", () => {
    const html = scoutReportFindsHtml(card, names)!;
    expect(html).toContain('data-tiles="470,250">1 town</button>');
    expect(html).toContain('data-tiles="465,252">1 waystation</button>');
    expect(html).toContain('data-tiles="466,249;466,250">');
    expect(html.startsWith("Scout drone found <button")).toBe(true);
  });

  it("keeps the plain text for a report filed before finds had tiles", () => {
    const { sites: _sites, ...old } = card as Extract<PersonalActivityCard, { kind: "SCOUT_REPORT" }>;
    expect(scoutReportFindsHtml(old, names)).toBeUndefined();
    const timeline: PersonalActivityTimeline = {
      playerId: "me", from: 0, to: 1_000,
      summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
      goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0, cards: [old], rivals: [], truncated: false
    };
    const out = chronicleHtml({ me: "me", timeline, loading: false, error: undefined, rivalFilter: "", selectedId: undefined, nameOf: names, colorOf: () => undefined, techName: () => undefined, nowMs: 1_000 });
    expect(out).not.toContain("data-v2-chronicle-find");
    expect(out).toContain("Scout drone found 1 town, 1 waystation");
  });

  it("clicking a find moves the camera there and rings all its tiles until the highlight runs out", () => {
    const state = createInitialState();
    const deps = { state, wrapX: (x: number) => x, wrapY: (y: number) => y, requestViewRefresh: vi.fn(), renderHud: vi.fn() };
    const host = document.createElement("div");
    host.innerHTML = scoutReportFindsHtml(card, names)!;
    const grain = host.querySelectorAll("[data-v2-chronicle-find]")[2]!;
    const rerender = vi.fn();
    expect(chronicleScoutFindClick(deps, grain, rerender)).toBe(true);
    expect(state.camX).toBe(466);
    expect(state.selected).toEqual({ x: 466, y: 249 });
    expect(screen.chronicleSelectedId).toBe("scout-1");
    expect(rerender).toHaveBeenCalled();
    const now = Date.now();
    expect(scoutFindingRingTiles(state, now)).toEqual([{ x: 466, y: 249 }, { x: 466, y: 250 }]);
    expect(scoutFindingRingTiles(state, now + SCOUT_FINDING_HIGHLIGHT_MS + 1_000)).toEqual([]);
  });

  it("ignores malformed tile data", () => {
    expect(decodeScoutFindTiles("1,2;x,3;;4")).toEqual([{ x: 1, y: 2 }]);
    expect(decodeScoutFindTiles(undefined)).toEqual([]);
  });
});
