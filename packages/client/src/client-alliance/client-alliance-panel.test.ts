// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { alliancePanelHtml, type AlliancePanelInput } from "./client-alliance-panel.js";
import { bindProposeButtons } from "./client-alliance-propose-buttons.js";

const NOW = Date.UTC(2026, 3, 13, 12, 0, 0);
const names: Record<string, string> = { "p-1": "SteamLord", "p-2": "IronFist", "ai-3": "AI 3" };

const panel = (overrides: Partial<AlliancePanelInput> = {}): string =>
  alliancePanelHtml({
    metPlayerIds: new Set(),
    allies: [],
    activeAllianceBreaks: [],
    activeTruces: [],
    incomingAllianceRequests: [],
    outgoingAllianceRequests: [],
    incomingTruceRequests: [],
    outgoingTruceRequests: [],
    playerNameForOwner: (id) => (id ? names[id] : undefined),
    playerColors: new Map(),
    nowMs: NOW,
    ...overrides
  });

describe("alliancePanelHtml", () => {
  it("says you haven't met anyone yet, with no empty section cards or inputs", () => {
    const html = panel();
    expect(html).toContain("You haven't met any other players yet.");
    expect(html).not.toContain("No allies");
    expect(html).not.toContain("No pending");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("propose-alliance");
  });

  it("lists met players with propose buttons and nothing else", () => {
    const html = panel({ metPlayerIds: new Set(["p-1", "ai-3"]) });
    expect(html).not.toContain("haven't met");
    expect(html).toContain("Players you've met");
    expect(html).toContain("SteamLord");
    expect(html).toContain("AI 3");
    expect(html).toContain("Propose Alliance");
    expect(html).toContain("Truce 12h");
    expect(html).toContain("Truce 24h");
    expect(html).not.toContain("Allies");
    expect(html).not.toContain("Needs your response");
  });

  it("shows each player once, in the section matching their state", () => {
    const html = panel({
      metPlayerIds: new Set(["p-1", "p-2", "ai-3"]),
      allies: ["p-1"],
      incomingAllianceRequests: [{ id: "r1", fromPlayerId: "p-2", toPlayerId: "me", createdAt: NOW - 60_000 }]
    });
    expect(html).toContain("Needs your response");
    expect(html).toContain("Allies");
    expect(html).toContain("Players you've met");
    for (const id of ["p-1", "p-2", "ai-3"]) expect(html.match(new RegExp(`data-player-name-id="${id}"`, "g"))).toHaveLength(1);
    expect(html).toContain("accept-request");
    expect(html).toContain("break-alliance");
    // only the one genuinely unengaged player gets propose buttons
    expect(html.match(/propose-alliance/g)).toHaveLength(1);
  });

  it("puts outgoing requests under waiting on others and keeps the player out of the met list", () => {
    const html = panel({
      metPlayerIds: new Set(["p-2"]),
      outgoingTruceRequests: [{ id: "t1", fromPlayerId: "me", toPlayerId: "p-2", createdAt: NOW - 60_000, expiresAt: NOW + 60_000, durationHours: 12 }]
    });
    expect(html).toContain("Waiting on others");
    expect(html).toContain("cancel-truce");
    expect(html).not.toContain("Players you've met");
    expect(html).not.toContain("propose-alliance");
  });

  it("shows an active truce as status on the player's row and still allows an alliance", () => {
    const html = panel({
      activeTruces: [{ otherPlayerId: "p-2", otherPlayerName: "IronFist", startedAt: NOW - 3_600_000, endsAt: NOW + 18 * 3_600_000, createdByPlayerId: "me" }]
    });
    expect(html).not.toContain("haven't met");
    expect(html).toContain("Truce");
    expect(html).toContain("18h left");
    expect(html).toContain("propose-alliance");
    expect(html).not.toContain("propose-truce");
    expect(html).toContain("break-truce");
    expect(html).toContain('data-break-truce-player-id="p-2"');
  });

  it("renders met players as collapsed rows, expanding only the requested one", () => {
    const collapsed = panel({ metPlayerIds: new Set(["p-1", "ai-3"]) });
    expect(collapsed).toContain("alliance-player-stack");
    expect(collapsed).not.toContain("is-expanded");
    expect(collapsed.match(/aria-expanded="false"/g)).toHaveLength(2);

    const expanded = panel({ metPlayerIds: new Set(["p-1", "ai-3"]), expandedPlayerId: "p-1" });
    expect(expanded.match(/is-expanded/g)).toHaveLength(1);
    expect(expanded).toMatch(/is-expanded" data-player-row-id="p-1"/);
    expect(expanded.match(/aria-expanded="true"/g)).toHaveLength(1);
  });

  it("sorts met players with numbers in natural order", () => {
    const html = panel({ metPlayerIds: new Set(["a-10", "a-2", "a-1"]), playerNameForOwner: (id) => id?.replace("a-", "AI ") });
    const order = [...html.matchAll(/data-player-name-id="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(["a-1", "a-2", "a-10"]);
  });

  it("gives a row with no actions no toggle, even if asked to expand it", () => {
    const html = panel({ metPlayerIds: new Set(["p-unknown"]), expandedPlayerId: "p-unknown" });
    expect(html).not.toContain("alliance-player-toggle");
    expect(html).not.toContain("is-expanded");
  });

  it("only offers Break Truce while a truce is active", () => {
    expect(panel({ metPlayerIds: new Set(["p-1"]) })).not.toContain("break-truce");
  });

  it("still offers Break Truce on a truced player whose name is not known yet", () => {
    const html = panel({
      activeTruces: [{ otherPlayerId: "p-9", otherPlayerName: "", startedAt: NOW - 1, endsAt: NOW + 3_600_000, createdByPlayerId: "me" }],
      playerNameForOwner: () => undefined
    });
    expect(html).toContain("break-truce");
    expect(html).not.toContain("propose-alliance");
  });

  it("does not offer actions for a met player whose name is not known yet", () => {
    const html = panel({ metPlayerIds: new Set(["p-unknown"]) });
    expect(html).toContain("Unknown empire");
    expect(html).not.toContain("propose-alliance");
  });

  it("escapes player names", () => {
    const html = panel({ metPlayerIds: new Set(["p-x"]), playerNameForOwner: () => "<img src=x onerror=1>" });
    expect(html).not.toContain("<img");
  });

  // Names used to be bare buttons with no colour and no click handler; they
  // now carry the player's map colour and data-player-name-id, which
  // wirePlayerProfileOverlay turns into "open this player's profile".
  it("gives every name a colour dot and the profile hook, on met rows, allies and requests", () => {
    const html = panel({
      metPlayerIds: new Set(["p-1"]),
      allies: ["p-2"],
      incomingAllianceRequests: [{ id: "r-1", fromPlayerId: "ai-3", toPlayerId: "me", fromName: "<img src=x onerror=1>", createdAt: NOW }],
      playerColors: new Map([["p-1", "#d94f30"], ["p-2", "#3a7bd5"], ["ai-3", "not-a-colour"]])
    });
    for (const id of ["p-1", "p-2", "ai-3"]) expect(html).toContain(`data-player-name-id="${id}"`);
    expect(html).toContain("--player-color:#d94f30");
    expect(html).toContain("--player-color:#3a7bd5");
    expect(html).toContain('class="lb-player-dot is-unknown"');
    expect(html).not.toContain("<img");
  });
});

describe("bindProposeButtons", () => {
  afterEach(() => closeDiplomacyTradeScreen());
  const state = { gold: 500, strategicResources: { SHARD: 2 }, incomingTruceRequests: [], incomingAllianceRequests: [] };
  const tradeTitle = (): string | null | undefined => document.querySelector(".diplomacy-trade-overlay h2")?.textContent;
  const pressedKind = (): string | undefined =>
    document.querySelector<HTMLButtonElement>(".diplomacy-trade-overlay [data-trade-kind][aria-pressed='true']")?.dataset.tradeKind;

  // Offers from the Alliances tab go through the trade screen (terms and the
  // AI's verdict first), never straight to the target.
  it("opens the trade screen for alliance and truce offers, which sends the offer", () => {
    const root = document.createElement("div");
    root.innerHTML = panel({ metPlayerIds: new Set(["p-1"]) });
    const sendGameMessage = vi.fn(() => true);
    bindProposeButtons(root, { playerNameForOwner: (id) => (id ? names[id] : undefined), sendGameMessage, state });

    root.querySelector<HTMLButtonElement>(".propose-alliance")!.click();
    expect(tradeTitle()).toBe("Deal with SteamLord");
    expect(pressedKind()).toBe("alliance:0");
    expect(sendGameMessage).toHaveBeenLastCalledWith({ type: "DIPLOMACY_STANCE_REQUEST", targetPlayerName: "SteamLord" }, expect.any(String));
    expect(document.querySelector("[data-trade-holdings]")?.textContent).toBe("You have 500 coin and 2 Shards.");

    root.querySelectorAll<HTMLButtonElement>(".propose-truce")[1]!.click();
    expect(pressedKind()).toBe("truce:24");
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "TRUCE_REQUEST" }), expect.any(String));
    document.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    expect(sendGameMessage).toHaveBeenLastCalledWith({ type: "TRUCE_REQUEST", targetPlayerName: "SteamLord", durationHours: 24 }, expect.any(String));
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ALLIANCE_REQUEST" }), expect.any(String));
  });

  it("breaks truces by id straight away", () => {
    const sendGameMessage = vi.fn(() => true);
    const trucedRoot = document.createElement("div");
    trucedRoot.innerHTML = panel({
      activeTruces: [{ otherPlayerId: "p-2", otherPlayerName: "IronFist", startedAt: NOW - 1, endsAt: NOW + 3_600_000, createdByPlayerId: "me" }]
    });
    bindProposeButtons(trucedRoot, { playerNameForOwner: (id) => (id ? names[id] : undefined), sendGameMessage, state });
    trucedRoot.querySelector<HTMLButtonElement>(".break-truce")!.click();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "TRUCE_BREAK", targetPlayerId: "p-2" }, expect.any(String));
  });
});
