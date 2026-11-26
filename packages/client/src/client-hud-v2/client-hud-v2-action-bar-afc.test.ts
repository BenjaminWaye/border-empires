import { describe, expect, it } from "vitest";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { actionBarHtml, selectBarButtons } from "./client-hud-v2-action-bar.js";

const act = (id: TileActionDef["id"], extra: Partial<TileActionDef> = {}): TileActionDef => ({ id, label: id, ...extra });
const ownAfc = (over: Partial<TileMenuView> = {}): TileMenuView => ({
  title: "Automated Fabrication Complex (551, 232)", subtitle: "Your garrisoned land", tabs: ["modules", "actions"],
  overviewLines: [], actions: [], buildings: [], crystal: [], afcUpgradesReady: 0, ...over
});
const kinds = (view: TileMenuView): string[] =>
  selectBarButtons(view).map((b) => (b.kind === "action" ? b.action.id : b.kind === "panel" ? b.panel : b.kind));

describe("action bar on your own AFC", () => {
  // Playtest 2026-11-14: tapping the AFC showed one wide Build ▸ (holding only Build AFC) while
  // AFC upgrades and Modules sat as small links underneath.
  it("leads with AFC upgrades in gold and Modules next to it, even with no upgrade ready", () => {
    const v = ownAfc();
    expect(selectBarButtons(v)[0]).toEqual({ kind: "afc", primary: true });
    expect(kinds(v)).toEqual(["afc", "modules"]);
    const html = actionBarHtml(v);
    expect(html).toContain('class="hud-v2-act hud-v2-act-primary" data-hud-v2-open="afc">AFC upgrades</button>');
    expect(html).toContain('data-hud-v2-panel="modules" aria-expanded="false">Modules ▸</button>');
    // Not repeated in the minor row.
    expect(html).not.toContain("AFC upgrades ▸");
    expect(html).not.toContain('hud-v2-minor-link" data-hud-v2-panel="modules"');
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

  describe("Send scout drone", () => {
    const send = act("afc_scout_drone", { label: "Send scout drone" });
    const callDown = act("redeploy_afc_module:masonry" as TileActionDef["id"], { label: "Call down Masonry" });
    const modules = (actions: TileActionDef[]): NonNullable<TileMenuView["modules"]> => ({ owned: true, active: true, slots: [], actions });

    it("leads in gold when there is no upgrade ready and nothing to call down", () => {
      const v = ownAfc({ actions: [send], modules: modules([]) });
      expect(selectBarButtons(v)[0]).toMatchObject({ kind: "action", primary: true, action: { id: "afc_scout_drone" } });
      expect(kinds(v)).toEqual(["afc_scout_drone", "afc", "modules"]);
      expect(selectBarButtons(v)[1]).toEqual({ kind: "afc", primary: false });
    });

    it("gives way to a ready AFC upgrade", () => {
      const v = ownAfc({ actions: [send], afcUpgradesReady: 1 });
      expect(selectBarButtons(v)[0]).toEqual({ kind: "afc", primary: true });
      expect(kinds(v)).not.toContain("afc_scout_drone");
    });

    it("gives way to a module to call down, which leads the bar in gold", () => {
      const v = ownAfc({ actions: [send], modules: modules([callDown]) });
      expect(selectBarButtons(v)[0]).toMatchObject({ kind: "panel", panel: "modules", primary: true });
      expect(kinds(v)).toEqual(["modules", "afc"]);
      expect(actionBarHtml(v)).toContain('class="hud-v2-act hud-v2-act-primary hud-v2-act-modules"');
    });

    it("still leads when the only module rows can't be called down (AFC full)", () => {
      const v = ownAfc({ actions: [send], modules: modules([{ ...callDown, disabled: true, disabledReason: "AFC full" }]) });
      expect(selectBarButtons(v)[0]).toMatchObject({ kind: "action", primary: true, action: { id: "afc_scout_drone" } });
    });

    it("leads with Recall drone while the drone flies out, and falls back to AFC upgrades while it heads home", () => {
      const out = ownAfc({ actions: [act("recall_scout", { label: "Recall drone" }), { ...send, disabled: true, disabledReason: "Scout drone is out" }] });
      expect(selectBarButtons(out)[0]).toMatchObject({ kind: "action", primary: true, action: { id: "recall_scout" } });
      const home = ownAfc({ actions: [{ ...send, disabled: true, disabledReason: "Scout drone is out" }] });
      expect(selectBarButtons(home)[0]).toEqual({ kind: "afc", primary: true });
    });

    it("gives way to an urgent action", () => {
      const v = ownAfc({ actions: [act("muster_hunt_attackers"), send] });
      expect(selectBarButtons(v)[0]).toMatchObject({ kind: "action", primary: true, action: { id: "muster_hunt_attackers" } });
    });

    // Regression (PR #2858 review): a callable module took gold from hunting attackers, which then
    // dropped off the bar entirely.
    it("lets an urgent action keep gold over a module to call down", () => {
      const v = ownAfc({ actions: [act("muster_hunt_attackers"), send], modules: modules([callDown]) });
      expect(selectBarButtons(v)[0]).toMatchObject({ kind: "action", primary: true, action: { id: "muster_hunt_attackers" } });
      expect(selectBarButtons(v)).toContainEqual({ kind: "panel", panel: "modules", label: "Modules ▸", primary: false });
    });
  });
});

describe("action bar on plain frontier", () => {
  // PR #2993 review: an enabled but unrecommended Garrison (plain tile) hid the greyed beacon and its reason.
  it("keeps a blocked Relay Beacon on the bar when only a minor Garrison is enabled", () => {
    const view: TileMenuView = {
      title: "Sand (567, 135)", subtitle: "Your frontier", tabs: ["actions"], overviewLines: [], crystal: [],
      actions: [act("settle_land", { label: "Garrison" }), act("settle_many", { label: "Garrison Many…" })],
      buildings: [act("build_relay_beacon", { label: "Relay Beacon", detail: "garrisons this tile first", disabled: true, disabledReason: "Need a free resource slot" })]
    };
    expect(selectBarButtons(view)[0]).toMatchObject({ kind: "action", primary: true, action: { id: "build_relay_beacon" } });
  });
});

