// @vitest-environment happy-dom
// Playtest 2026-11-12: on a phone the Build ▸ sheet fills the screen and had no ✕ (only Esc / back closed it).
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { buildListHtml } from "./client-hud-v2-build-list.js";
import { dockTileActionMenuForHudV2, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

const act = (id: string, extra: Partial<TileActionDef> = {}): TileActionDef =>
  ({ id, label: id, ...extra }) as TileActionDef;

const view = (): TileMenuView =>
  ({
    title: "Grassland (4, 7)", subtitle: "Yours", tabs: [], overviewLines: [], actions: [],
    buildings: [act("build_hydrogarden", { label: "Hydrogarden", cost: "200 gold" })],
    crystal: [act("siphon_tile", { label: "Siphon", cost: "40 crystal" })]
  }) as unknown as TileMenuView;

const side = (): HTMLElement => document.getElementById("hud-v2-build") as HTMLElement;
const click = (el: Element | null): void => {
  (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("Build ▸ / Aether ▸ sheet close", () => {
  const state = createInitialState();
  const deps: TileDockDeps = {
    tileActionMenuEl: document.createElement("div"),
    handleTileAction: () => undefined,
    hideTileActionMenu: () => undefined,
    renderHud: () => undefined
  };
  let tileX = 0;

  beforeAll(() => {
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><section id="hud-v2-build" hidden></section>`;
    deps.tileActionMenuEl = document.getElementById("tile-action-menu") as HTMLElement;
    state.tileActionMenu.mode = "single";
  });

  beforeEach(() => {
    tileX += 1;
    state.tileActionMenu.currentTileKey = `${tileX},7`;
    dockTileActionMenuForHudV2(state, view(), deps, () => undefined);
  });

  for (const panel of ["build", "aether"] as const) {
    it(`shuts the ${panel} sheet from its own ✕ and keeps the tile's bar`, () => {
      click(document.querySelector(`#hud-v2-tile [data-hud-v2-panel="${panel}"]`));
      expect(side().hidden).toBe(false);
      const close = side().querySelector<HTMLButtonElement>(`.v2t-build-head [data-hud-v2-panel-close="${panel}"]`);
      expect(close?.getAttribute("aria-label")).toBe(panel === "build" ? "Close Build" : "Close Aether");
      click(close);
      expect(side().hidden).toBe(true);
      expect(document.body.classList.contains("hud-v2-building")).toBe(false);
      expect((document.getElementById("hud-v2-tile") as HTMLElement).hidden).toBe(false);
      // Not a toggle that a second press would reopen: the bar's own button opens it again.
      click(document.querySelector(`#hud-v2-tile [data-hud-v2-panel="${panel}"]`));
      expect(side().hidden).toBe(false);
    });
  }

  it("leaves the town screen's build list without a sheet ✕", () => {
    const html = buildListHtml({
      buildings: view().buildings, focusLabel: "Town", focusHighlighted: false, selection: undefined, category: undefined,
      emptyText: "", targetKey: "1,1", placeLabel: "Place"
    });
    expect(html).not.toContain("data-hud-v2-panel-close");
  });
});
