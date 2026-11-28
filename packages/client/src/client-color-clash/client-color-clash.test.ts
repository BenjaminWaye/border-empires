// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest";
import { empireColorRejection } from "@border-empires/shared";
import { syncColorSwatchButtons } from "../client-auth-ui/client-auth-ui.js";
import { applyServerColorsInUse, colorClashReason, colorsInUseFor, rivalEmpireColors, syncColorClashNote } from "./client-color-clash.js";

// Owner rule 2026-11-27: a playtester read a rival's pale pink as their own.
const state = {
  me: "me",
  playerColors: new Map([
    ["me", "#38b000"],
    ["rosa", "#FABEBE"],
    ["barbarian-1", "#2f3842"],
    ["broken", "not-a-colour"]
  ]),
  playerNames: new Map([["rosa", "Rosa"]])
};

describe("client colour clash marking", () => {
  test("rivals are every other empire, never the player or the barbarians", () => {
    expect(rivalEmpireColors(state).map((rival) => rival.playerId)).toEqual(["rosa"]);
  });

  test("a pale pink next to Rosa's pale pink gets a terse reason", () => {
    const rivals = colorsInUseFor(state);
    expect(colorClashReason("#f7b6d2", rivals)).toBe("Too close to Rosa's colour.");
    expect(colorClashReason("#1f77b4", rivals)).toBeUndefined();
  });

  test("swatches too close are greyed out; spare buttons are hidden", () => {
    const buttons = Array.from({ length: 3 }, () => document.createElement("button"));
    syncColorSwatchButtons(buttons, ["#f7b6d2", "#1f77b4"], "#1f77b4", colorsInUseFor(state));
    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[0]!.dataset.tooClose).toBe("true");
    expect(buttons[0]!.title).toBe("Too close to Rosa's colour.");
    expect(buttons[1]!.disabled).toBe(false);
    expect(buttons[1]!.dataset.selected).toBe("true");
    expect(buttons[2]!.hidden).toBe(true);
  });

  test("the custom colour note shows only for a new clashing pick", () => {
    const note = document.createElement("div");
    const rivals = colorsInUseFor(state);
    syncColorClashNote(note, "#f7b6d2", rivals, "#38b000");
    expect(note.textContent).toBe("Too close to Rosa's colour.");
    expect(note.hidden).toBe(false);
    syncColorClashNote(note, "#f7b6d2", rivals, "#F7B6D2");
    expect(note.hidden).toBe(true);
  });
});

// Playtest 2026-11-28 ("Found your first standard"): orange and green looked
// free but "Enter the map" refused them as too close to "House Noname 47" and
// "Priya", empires the client had never seen. The gateway now sends the set
// it checks against, and the client checks with it.
describe("client checks against the gateway's colours in use", () => {
  afterEach(() => applyServerColorsInUse({}, true));
  const gatewaySet = {
    exact: ["#ffffff", "#2f3842"],
    empires: [
      { playerId: "guest-47", name: "House Noname 47", color: "#f59e0b" },
      { playerId: "priya", name: "Priya", color: "#38b000" }
    ]
  };

  test("a swatch near an empire only the gateway knows is greyed out", () => {
    applyServerColorsInUse({ colorsInUse: gatewaySet }, true);
    const buttons = Array.from({ length: 2 }, () => document.createElement("button"));
    syncColorSwatchButtons(buttons, ["#f39c12", "#1f77b4"], "#1f77b4", colorsInUseFor(state));
    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[0]!.title).toBe("Too close to House Noname 47's colour.");
    expect(buttons[1]!.disabled).toBe(false);
  });

  test("a colour another empire holds exactly is refused inline, as on submit", () => {
    applyServerColorsInUse({ colorsInUse: gatewaySet }, true);
    expect(colorClashReason("#FFFFFF", colorsInUseFor(state))).toBe("That colour is already taken by another empire.");
  });

  test("with no server swatches the buttons get free colours, not stale defaults", () => {
    applyServerColorsInUse({ colorsInUse: gatewaySet }, true);
    const buttons = Array.from({ length: 6 }, () => {
      const btn = document.createElement("button");
      btn.dataset.color = "#f59e0b"; // a stale default from an earlier render
      return btn;
    });
    const inUse = colorsInUseFor(state);
    syncColorSwatchButtons(buttons, [], "#123456", inUse);
    for (const btn of buttons) {
      expect(btn.hidden).toBe(false);
      expect(empireColorRejection(btn.dataset.color!, inUse)).toBeUndefined();
      expect(btn.disabled).toBe(false);
    }
  });

  test("the note offers the colour the gateway would suggest, applied with one tap", () => {
    applyServerColorsInUse({ colorsInUse: gatewaySet }, true);
    const note = document.createElement("div");
    let applied = "";
    const inUse = colorsInUseFor(state);
    syncColorClashNote(note, "#f39c12", inUse, "#de3565", (hex) => { applied = hex; });
    const tryBtn = note.querySelector<HTMLButtonElement>("button[data-suggest-color]");
    expect(tryBtn).not.toBeNull();
    tryBtn!.click();
    expect(applied).toBe(tryBtn!.dataset.suggestColor);
    expect(empireColorRejection(applied, inUse)).toBeUndefined();
  });
});

