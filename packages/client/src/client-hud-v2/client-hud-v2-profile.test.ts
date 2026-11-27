// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { forgetWritten, writeHtml } from "./client-hud-v2-context.js";
import { profileHtml, profileScreenStep, type ProfileInput } from "./client-hud-v2-profile.js";

const base: ProfileInput = {
  id: "p2",
  name: "Vasker",
  color: "#6a8f3a",
  relation: { kind: "none" },
  entry: { id: "p2", name: "Vasker", tiles: 42, incomePerMinute: 0.5, techs: 7, manpowerCap: 900, score: 310, rank: 2 },
  career: { seasonsPlayed: 3, bestRank: 1, peakScore: 820, peakTiles: 140, rating: 1264, lastRatingDelta: -12, peakRating: 1290 },
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
  it("restores the mobile page and desktop details scroll positions when stats refresh", () => {
    const host = document.createElement("div");
    host.id = "test-profile-scroll";
    document.body.append(host);
    try {
      writeHtml(host.id, profileHtml(base));
      host.querySelector<HTMLElement>(".v2p")!.scrollTop = 180;
      host.querySelector<HTMLElement>(".v2p-main")!.scrollTop = 70;

      writeHtml(host.id, profileHtml({ ...base, entry: { ...base.entry!, score: 325 } }));

      expect(host.querySelector(".v2p-stats")?.textContent).toContain("325");
      expect(host.querySelector(".v2p")?.scrollTop).toBe(180);
      expect(host.querySelector(".v2p-main")?.scrollTop).toBe(70);
    } finally {
      forgetWritten(host.id);
      host.remove();
    }
  });

  it("offers Share profile on your own profile only", () => {
    expect(render({ ...base, relation: { kind: "self" } }).querySelector("[data-v2-profile-share]")?.textContent).toBe("Share profile");
    expect(render(base).querySelector("[data-v2-profile-share], [data-v2-profile-unshare], [data-v2-profile-save-to-share]")).toBeNull();
  });

  it("shows Stop sharing only while a public link exists", () => {
    const self = { ...base, relation: { kind: "self" } as const };
    for (const share of [undefined, { state: "unknown" }, { state: "off" }] as const) {
      const host = render(share ? { ...self, share } : self);
      expect(host.querySelector("[data-v2-profile-share]")?.textContent).toBe("Share profile");
      expect(host.querySelector("[data-v2-profile-unshare]")).toBeNull();
    }
    expect(render({ ...self, share: { state: "on" } }).querySelector("[data-v2-profile-unshare]")?.textContent).toBe("Stop sharing");
  });

  // Playtest 2026-11-27: score 25 -> 24 after capturing 19 tiles, with nothing saying why.
  it("breaks the score into garrisoned tiles, coin and Manifests", () => {
    const host = render({ ...base, entry: { ...base.entry!, tiles: 12, incomePerMinute: 0.005, techs: 1, score: 24.3 } });
    const card = host.querySelector("[data-v2-profile-score]");
    expect(card?.querySelector("b")?.textContent).toBe("24");
    expect(card?.textContent).toContain("Tiles 12 · Coin 4.3 · Manifests 8");
    expect(card?.textContent).toContain("Frontier scores once garrisoned");
  });

  it("shows the shared link while sharing is on", () => {
    const host = render({ ...base, relation: { kind: "self" }, share: { state: "on", note: "Link copied", link: "https://play.example/house.html?h=Ab" } });
    expect(host.querySelector("[data-v2-profile-share-link]")?.getAttribute("href")).toBe("https://play.example/house.html?h=Ab");
    expect(host.querySelector(".v2p-share-note")?.textContent).toBe("Link copied");
  });

  it("keeps share progress and its outcome on screen across re-renders", () => {
    const self = { ...base, relation: { kind: "self" } as const };
    const stopping = render({ ...self, share: { state: "on", pending: "stop" } });
    expect(stopping.querySelector("[data-v2-profile-unshare]")?.textContent).toBe("Stopping…");
    expect(stopping.querySelector<HTMLButtonElement>("[data-v2-profile-share]")?.disabled).toBe(true);
    const stopped = render({ ...self, share: { state: "off", note: "Sharing stopped" } });
    expect(stopped.querySelector("[data-v2-profile-unshare]")).toBeNull();
    expect(stopped.querySelector(".v2p-share-note")?.textContent).toBe("Sharing stopped");
    expect(render({ ...self, share: { state: "unknown", pending: "share" } }).querySelector("[data-v2-profile-share]")?.textContent).toBe("Making link…");
  });

  it("sends a guest to save their empire instead of offering share or stop", () => {
    const host = render({ ...base, relation: { kind: "self" }, share: "guest" });
    expect(host.querySelector("[data-v2-profile-save-to-share]")?.textContent).toBe("Save your empire to share");
    expect(host.querySelector("[data-v2-profile-share], [data-v2-profile-unshare]")).toBeNull();
  });

  it("offers Show on map only for an empire you have seen", () => {
    const seen = render({ ...base, mapFocus: "seen" }).querySelector<HTMLButtonElement>("[data-v2-profile-show-map]");
    expect(seen?.textContent).toBe("Show on map");
    expect(seen?.dataset.v2ProfileShowMap).toBe("p2");
    const unseen = render({ ...base, mapFocus: "unseen" });
    expect(unseen.querySelector("[data-v2-profile-show-map]")).toBeNull();
    const disabled = Array.from(unseen.querySelectorAll<HTMLButtonElement>(".v2p-action")).find((b) => b.disabled);
    expect(disabled?.textContent).toBe("Not discovered yet");
    expect(render({ ...base, relation: { kind: "self" } }).textContent).not.toContain("Show on map");
  });

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
    expect(host.querySelector(".v2p-stats")?.textContent).toContain("Manifests");
    expect(host.querySelector(".v2p-stats")?.textContent).not.toContain("Techs");
    expect(host.textContent).toContain("Town Control");
    expect(host.textContent).toContain("Orla");
    expect(host.querySelector("[data-v2-profile-diplomacy='p2']")).not.toBeNull();
    expect(host.querySelector(".intel-modal")).toBeNull();
  });

  it("shows the season-end rating with its last change in the career panel", () => {
    const text = render(base).textContent ?? "";
    expect(text).toContain("1,264 (−12)");
    expect(text).toContain("1,290");
    expect(text).toContain("Vs. starting 1,200+64");
    const unrated = render({ ...base, career: { seasonsPlayed: 3, bestRank: 1, peakScore: 820, peakTiles: 140, rating: null, lastRatingDelta: null, peakRating: null } });
    expect(unrated.querySelector(".v2p-rows")?.textContent).toContain("Rating—");
  });

  it("explains how the rating is calculated behind a ? toggle", () => {
    const help = render(base).querySelector<HTMLDetailsElement>("details.v2p-help");
    expect(help?.querySelector("summary")?.textContent).toContain("How rating works");
    expect(help?.open).toBe(false);
    expect(help?.textContent).toContain("final rank");
    expect(help?.textContent).toContain("1,200");
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
