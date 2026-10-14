// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
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
    for (const id of ["p-1", "p-2", "ai-3"]) expect(html.match(new RegExp(`data-inspect-player="${id}"`, "g"))).toHaveLength(1);
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
    const order = [...html.matchAll(/data-inspect-player="([^"]+)"/g)].map((match) => match[1]);
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
});

describe("bindProposeButtons", () => {
  it("sends alliance and truce requests by display name and breaks truces by id", () => {
    const root = document.createElement("div");
    root.innerHTML = panel({ metPlayerIds: new Set(["p-1"]) });
    const sendGameMessage = vi.fn(() => true);
    bindProposeButtons(root, { playerNameForOwner: (id) => (id ? names[id] : undefined), sendGameMessage });

    root.querySelector<HTMLButtonElement>(".propose-alliance")!.click();
    root.querySelectorAll<HTMLButtonElement>(".propose-truce")[1]!.click();
    const trucedRoot = document.createElement("div");
    trucedRoot.innerHTML = panel({
      activeTruces: [{ otherPlayerId: "p-2", otherPlayerName: "IronFist", startedAt: NOW - 1, endsAt: NOW + 3_600_000, createdByPlayerId: "me" }]
    });
    bindProposeButtons(trucedRoot, { playerNameForOwner: (id) => (id ? names[id] : undefined), sendGameMessage });
    trucedRoot.querySelector<HTMLButtonElement>(".break-truce")!.click();

    expect(sendGameMessage).toHaveBeenNthCalledWith(1, { type: "ALLIANCE_REQUEST", targetPlayerName: "SteamLord" }, expect.any(String));
    expect(sendGameMessage).toHaveBeenNthCalledWith(2, { type: "TRUCE_REQUEST", targetPlayerName: "SteamLord", durationHours: 24 }, expect.any(String));
    expect(sendGameMessage).toHaveBeenNthCalledWith(3, { type: "TRUCE_BREAK", targetPlayerId: "p-2" }, expect.any(String));
  });
});
