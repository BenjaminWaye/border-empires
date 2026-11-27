// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { syncColorSwatchButtons } from "../client-auth-ui/client-auth-ui.js";
import { colorClashReason, rivalEmpireColors, syncColorClashNote } from "./client-color-clash.js";

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
    const rivals = rivalEmpireColors(state);
    expect(colorClashReason("#f7b6d2", rivals)).toBe("Too close to Rosa's colour.");
    expect(colorClashReason("#1f77b4", rivals)).toBeUndefined();
  });

  test("swatches too close are greyed out; spare buttons are hidden", () => {
    const buttons = Array.from({ length: 3 }, () => document.createElement("button"));
    syncColorSwatchButtons(buttons, ["#f7b6d2", "#1f77b4"], "#1f77b4", rivalEmpireColors(state));
    expect(buttons[0]!.disabled).toBe(true);
    expect(buttons[0]!.dataset.tooClose).toBe("true");
    expect(buttons[0]!.title).toBe("Too close to Rosa's colour.");
    expect(buttons[1]!.disabled).toBe(false);
    expect(buttons[1]!.dataset.selected).toBe("true");
    expect(buttons[2]!.hidden).toBe(true);
  });

  test("the custom colour note shows only for a new clashing pick", () => {
    const note = document.createElement("div");
    const rivals = rivalEmpireColors(state);
    syncColorClashNote(note, "#f7b6d2", rivals, "#38b000");
    expect(note.textContent).toBe("Too close to Rosa's colour.");
    expect(note.hidden).toBe(false);
    syncColorClashNote(note, "#f7b6d2", rivals, "#F7B6D2");
    expect(note.hidden).toBe(true);
  });
});
