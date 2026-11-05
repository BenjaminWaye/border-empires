// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { profileHtml, profileScreenStep, type ProfileInput } from "./client-hud-v2-profile.js";

const base: ProfileInput = {
  id: "p2",
  name: "Vasker",
  color: "#6a8f3a",
  relation: { kind: "none" },
  entry: { id: "p2", name: "Vasker", tiles: 42, incomePerMinute: 0.5, techs: 7, manpowerCap: 900, score: 310, rank: 2 },
  career: { seasonsPlayed: 3, bestRank: 1, peakScore: 820, peakTiles: 140 },
  holdings: { planets: [], outposts: [], trophyCase: [{ objectiveId: "TOWN_CONTROL", objectiveName: "Town Control", count: 2 }] },
  pacts: { allies: ["p3"], activeTruces: [] },
  truceBreaks: [],
  nameOf: (id) => (id === "p3" ? "Orla" : undefined),
  nowMs: 0
};

const render = (input: ProfileInput): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = profileHtml(input);
  return host;
};

describe("player profile screen", () => {
  it("opens for a picked player and closes once dismissed", () => {
    expect(profileScreenStep("p2", null)).toBe("open");
    expect(profileScreenStep("p2", "ranks")).toBe("open");
    expect(profileScreenStep("p2", "profile")).toBe("stay");
    expect(profileScreenStep(undefined, "profile")).toBe("close");
    expect(profileScreenStep(undefined, "manifest")).toBe("stay");
  });

  // Regression: the profile was the legacy modal dropped into the frame, a small card in an empty screen.
  it("draws a hero column, the season numbers and career panels", () => {
    const host = render(base);
    expect(host.querySelector(".v2p-name")?.textContent).toBe("Vasker");
    expect(host.querySelector(".v2p-rank b")?.textContent).toBe("#2");
    expect(host.querySelectorAll(".v2p-stat").length).toBe(5);
    expect(host.querySelector(".v2p-stats")?.textContent).toContain("720.0");
    expect(host.textContent).toContain("Town Control");
    expect(host.textContent).toContain("Orla");
    expect(host.querySelector("[data-v2-profile-diplomacy='p2']")).not.toBeNull();
    expect(host.querySelector(".intel-modal")).toBeNull();
  });

  // Emoji icons read as generated UI; trophies use the simple SVG icon set.
  it("draws trophies with the SVG icon set, not emoji", () => {
    const icon = render(base).querySelector<HTMLImageElement>(".v2p-icon img.trophy-icon");
    expect(icon?.getAttribute("src")).toBe("/icons/simple/town-support.svg");
    expect(render(base).querySelector(".v2p-list")?.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("shows your own empire without a Diplomacy button, and marks an oathbreaker", () => {
    const host = render({ ...base, relation: { kind: "self" }, truceBreaks: [{ targetPlayerId: "p4", targetPlayerName: "Hollis", brokenAt: 0 }] });
    expect(host.querySelector("[data-v2-profile-diplomacy]")).toBeNull();
    expect(host.querySelector(".v2p-badge-oath")?.textContent).toContain("×1");
    expect(host.textContent).toContain("Your empire");
  });

  it("shows loading panels until the fetched data arrives", () => {
    const host = render({ ...base, entry: undefined, career: "loading", holdings: "loading", pacts: "loading", truceBreaks: "loading" });
    expect(host.querySelectorAll(".v2p-none").length).toBeGreaterThanOrEqual(3);
    expect(host.querySelector(".v2p-rank span")?.textContent).toBe("Unranked");
  });

  // Review: Diplomacy was offered on a barbarian's profile.
  it("offers no Diplomacy for barbarians", () => {
    expect(render({ ...base, id: "barbarian-1", name: "Barbarians" }).querySelector("[data-v2-profile-diplomacy]")).toBeNull();
  });
});
