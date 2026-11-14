import { describe, expect, it } from "vitest";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { actionBarHtml, selectBarButtons } from "./client-hud-v2-action-bar.js";

const act = (id: TileActionDef["id"], extra: Partial<TileActionDef> = {}): TileActionDef => ({ id, label: id, ...extra });
const ownAfc = (over: Partial<TileMenuView> = {}): TileMenuView => ({
  title: "Automated Fabrication Complex (551, 232)", subtitle: "Your garrisoned land", tabs: ["modules", "actions"],
  overviewLines: [], actions: [], buildings: [], crystal: [], afcUpgradesReady: 0, ...over
});
const kinds = (view: TileMenuView): string[] =>
  selectBarButtons(view).map((b) => (b.kind === "action" ? b.action.id : b.kind === "panel" ? b.panel : b.kind === "tab" ? b.tab : b.kind));

describe("action bar on your own AFC", () => {
  // Playtest 2026-11-14: tapping the AFC showed one wide Build ▸ (holding only Build AFC) while
  // AFC upgrades and Modules sat as small links underneath.
  it("leads with AFC upgrades in gold and Modules next to it, even with no upgrade ready", () => {
    const v = ownAfc();
    expect(selectBarButtons(v)[0]).toEqual({ kind: "afc", primary: true });
    expect(kinds(v)).toEqual(["afc", "modules"]);
    const html = actionBarHtml(v);
    expect(html).toContain('class="hud-v2-act hud-v2-act-primary" data-hud-v2-open="afc">AFC upgrades</button>');
    expect(html).toContain('data-hud-v2-tab="modules">Modules ▸</button>');
    // Not repeated in the minor row.
    expect(html).not.toContain("AFC upgrades ▸");
    expect(html).not.toContain('hud-v2-minor-link" data-hud-v2-tab="modules"');
  });

  it("still says how many upgrades are ready", () => {
    expect(actionBarHtml(ownAfc({ afcUpgradesReady: 2 }))).toContain(">AFC upgrades · 2 ready</button>");
  });

  it("lets an urgent action keep gold, with AFC upgrades beside it", () => {
    const buttons = selectBarButtons(ownAfc({ actions: [act("muster_hunt_attackers")] }));
    expect(buttons[0]).toMatchObject({ kind: "action", primary: true, action: { id: "muster_hunt_attackers" } });
    expect(buttons[1]).toEqual({ kind: "afc", primary: false });
  });

  it("leaves other tiles unchanged", () => {
    const { afcUpgradesReady: _ready, ...plain } = ownAfc({ tabs: ["actions"] });
    expect(kinds(plain as TileMenuView)).toEqual([]);
  });
});
