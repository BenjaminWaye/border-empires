// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { combatPower, formatCombatPower } from "./client-hud-v2-profile-combat.js";
import { profileHtml, type ProfileInput } from "./client-hud-v2-profile.js";

const base: ProfileInput = {
  id: "me",
  name: "Brass",
  color: "#6a8f3a",
  relation: { kind: "self" },
  entry: { id: "me", name: "Brass", tiles: 42, incomePerMinute: 0.5, techs: 7, manpowerCap: 900, score: 310, rank: 2 },
  career: undefined,
  holdings: undefined,
  pacts: { allies: [], activeTruces: [] },
  truceBreaks: [],
  nameOf: () => undefined,
  nowMs: 0
};

const render = (input: ProfileInput): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = profileHtml(input);
  return host;
};

const combat = {
  attack: [{ label: "Base", mult: 1 }, { label: "Bronze Drill", mult: 1.1 }, { label: "No Titanium Weapons Factory", mult: 0.9 }],
  defense: [{ label: "Base", mult: 1 }]
};

describe("profile Attack and Defense", () => {
  it("multiplies base power by every source, ignoring the Base row", () => {
    expect(formatCombatPower(combatPower(combat.attack))).toBe("9.9");
    expect(formatCombatPower(combatPower(combat.defense))).toBe("10");
  });

  // HUD v2 had nowhere to read your own Attack/Defense outside a battle.
  it("adds Attack and Defense cards and source panels on your own profile", () => {
    const host = render({ ...base, combat });
    expect(host.querySelectorAll(".v2p-stat").length).toBe(7);
    expect(host.querySelector(".v2p-stat-atk b")?.textContent).toBe("9.9");
    expect(host.querySelector(".v2p-stat-def b")?.textContent).toBe("10");
    const attack = host.querySelector("[data-v2-combat='attack']");
    expect(attack?.textContent).toContain("Bronze Drill");
    expect(attack?.querySelector(".v2p-mod-good")?.textContent).toBe("+10%");
    expect(attack?.querySelector(".v2p-mod-bad")?.textContent).toBe("−10%");
    expect(attack?.textContent).not.toMatch(/Base[\s\S]*Base/);
    expect(host.querySelector("[data-v2-combat='defense']")?.textContent).toContain("No bonuses yet");
  });

  it("leaves strength off profiles without combat data, like a rival's", () => {
    const host = render(base);
    expect(host.querySelectorAll(".v2p-stat").length).toBe(5);
    expect(host.querySelector("[data-v2-combat]")).toBeNull();
  });

  it("escapes source labels", () => {
    const host = render({ ...base, combat: { attack: [{ label: "<b>x</b>", mult: 1.2 }], defense: [] } });
    expect(host.querySelector("[data-v2-combat='attack'] b")).toBeNull();
  });
});
