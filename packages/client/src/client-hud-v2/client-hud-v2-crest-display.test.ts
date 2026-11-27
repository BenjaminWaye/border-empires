// @vitest-environment happy-dom
import type { CrestCosmeticId } from "@border-empires/shared";
import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it, vi } from "vitest";

import { battlePreviewHtml } from "./client-hud-v2-battle.js";
import { chronicleHtml } from "./client-hud-v2-chronicle.js";
import { diplomacyListHtml } from "./client-hud-v2-diplomacy.js";
import { navHtml } from "./client-hud-v2-nav.js";
import { profileCrestClick, profileCrestFields, profileCrestHtml } from "./client-hud-v2-profile-crest.js";
import { ranksBodyHtml } from "./client-hud-v2-ranks.js";
import { isProfileEditOpen, setProfileEditOpen } from "../client-hud/client-hud-profile-edit-overlay.js";
import { rivalsHtml } from "./client-hud-v2-rivals.js";

// Playtest 2026-11-27: a House's emblem was only ever a letter in a square.
// Every emblem now shows the House's crest when it has one, else the letter.

const crests: Record<string, CrestCosmeticId> = { anna: "crest-kraken" };
const crestOf = (id: string): CrestCosmeticId | undefined => crests[id];
const names: Record<string, string> = { me: "Harrow", anna: "Anna", bern: "Bern" };
const nameOf = (id: string): string => names[id] ?? "";
const colorOf = (): string => "#336699";

const host = (html: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

describe("House emblems show the crest or the letter", () => {
  it("HUD emblem", () => {
    const base = { name: "Harrow", color: "#abc", afcReady: 0, diplomacyRequests: 0, chronicleUnread: 0, active: undefined };
    expect(host(navHtml({ ...base, crest: "crest-cog" })).querySelector('[data-hud-v2-open="self"] svg.house-crest-glyph')).not.toBeNull();
    expect(host(navHtml(base)).querySelector('[data-hud-v2-open="self"]')?.textContent).toBe("H");
  });

  it("rivals strip", () => {
    const el = host(rivalsHtml({ me: "me", metPlayerIds: new Set(["anna", "bern"]), allies: [], activeTruces: [], nameOf, colorOf, crestOf, nowMs: 0 }));
    expect(el.querySelector('[data-hud-v2-diplomacy="anna"] .hud-v2-rival-token svg')).not.toBeNull();
    expect(el.querySelector('[data-hud-v2-diplomacy="bern"] .hud-v2-rival-token')?.textContent).toBe("B");
  });

  it("Diplomacy list", () => {
    const el = host(diplomacyListHtml({
      me: "me", metPlayerIds: new Set(["anna", "bern"]), allies: [], activeTruces: [], incomingAlliance: [], incomingTruce: [],
      leaderboard: [], nameOf, colorOf, crestOf, nowMs: 0
    }));
    expect(el.querySelector('[data-v2-dip-open="anna"] .v2d-crest svg')).not.toBeNull();
    expect(el.querySelector('[data-v2-dip-open="bern"] .v2d-crest')?.textContent).toBe("B");
  });

  it("Ranks standings", () => {
    const entry = (id: string, rank: number) => ({ id, name: names[id] ?? id, tiles: 1, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 10 - rank, rank });
    const el = host(ranksBodyHtml({ me: "me", objectives: [], overall: [entry("anna", 1), entry("bern", 2)], selfOverall: undefined, nameOf, colorOf, crestOf }));
    expect(el.querySelector('[data-hud-v2-profile="anna"] .v2r-crest svg')).not.toBeNull();
    expect(el.querySelector('[data-hud-v2-profile="bern"] .v2r-crest')?.textContent).toBe("B");
  });

  it("Chronicle rivals", () => {
    const timeline: PersonalActivityTimeline = {
      playerId: "me", from: 0, to: 1_000,
      summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
      goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0, cards: [], truncated: false,
      rivals: [{ playerId: "anna", tilesTaken: 1, tilesLost: 0, attacksRepelled: 0, attacksFailed: 0 }, { playerId: "bern", tilesTaken: 1, tilesLost: 0, attacksRepelled: 0, attacksFailed: 0 }]
    };
    const el = host(chronicleHtml({ me: "me", timeline, loading: false, error: undefined, rivalFilter: "", selectedId: undefined, nameOf, colorOf, crestOf, techName: () => undefined, nowMs: 1_000 }));
    const rivals = Array.from(el.querySelectorAll(".v2c-rival .v2c-crest"));
    expect(rivals[0]?.querySelector("svg")).not.toBeNull();
    expect(rivals[1]?.textContent).toBe("B");
  });

  it("battle sides", () => {
    const side = (id: string) => ({ id, name: names[id] ?? id, color: "#123", crest: crestOf(id), role: "", sub: "" });
    const el = host(battlePreviewHtml({ title: "", coords: { x: 0, y: 0 }, you: side("bern"), them: side("anna"), breakdown: undefined, winPct: undefined, efforts: [], commit: undefined }));
    expect(el.querySelector(".v2b-side-them .v2b-crest svg")).not.toBeNull();
    expect(el.querySelector(".v2b-side-you .v2b-crest")?.textContent).toBe("B");
  });
});

describe("your own profile's emblem", () => {
  const state = { playerCosmetics: new Map([["me", { crest: "crest-anchor" as const }]]) };

  it("is a button to the Edit Name, Colour & Crest dialog, and plain on a rival's profile", () => {
    const mine = host(profileCrestHtml({ name: "Harrow", color: "#abc", ...profileCrestFields(state, "me", true) }));
    expect(mine.querySelector("button[data-v2-edit-profile] .v2p-crest svg")).not.toBeNull();
    expect(mine.querySelector("[data-profile-edit-crest]")).toBeNull();
    const theirs = host(profileCrestHtml({ name: "Anna", color: "#abc", ...profileCrestFields(state, "anna", false) }));
    expect(theirs.querySelector("button")).toBeNull();
    expect(theirs.querySelector(".v2p-crest")?.textContent).toBe("A");
  });

  it("opens the dialog when tapped and leaves other clicks alone", () => {
    const el = host(profileCrestHtml({ name: "Harrow", color: "#abc", ...profileCrestFields(state, "me", true) }));
    const renderHud = vi.fn();
    setProfileEditOpen(false);
    expect(profileCrestClick(renderHud, el.querySelector(".v2p-crest-change") as Element)).toBe(true);
    expect(isProfileEditOpen()).toBe(true);
    expect(renderHud).toHaveBeenCalledTimes(1);
    setProfileEditOpen(false);
    expect(profileCrestClick(renderHud, host("<span class='x'></span>").querySelector(".x") as Element)).toBe(false);
    expect(isProfileEditOpen()).toBe(false);
  });
});
