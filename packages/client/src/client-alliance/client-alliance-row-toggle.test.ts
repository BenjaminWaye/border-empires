// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { alliancePanelHtml } from "./client-alliance-panel.js";
import { bindMetPlayerRowToggles } from "./client-alliance-row-toggle.js";

const names: Record<string, string> = { "p-1": "SteamLord", "p-2": "IronFist" };

const render = (expandedPlayerId?: string): HTMLElement => {
  const html = alliancePanelHtml({
    metPlayerIds: new Set(["p-1", "p-2"]),
    allies: [],
    activeAllianceBreaks: [],
    activeTruces: [],
    incomingAllianceRequests: [],
    outgoingAllianceRequests: [],
    incomingTruceRequests: [],
    outgoingTruceRequests: [],
    playerNameForOwner: (id) => (id ? names[id] : undefined),
    playerColors: new Map(),
    nowMs: 0,
    expandedPlayerId
  });
  // Desktop panel and mobile sheet each hold a copy of the list.
  const root = document.createElement("div");
  root.innerHTML = `<div class="desktop">${html}</div><div class="mobile">${html}</div>`;
  return root;
};

const expandedIds = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>(".alliance-player-card.is-expanded")).map((card) => card.dataset.playerRowId ?? "");

describe("bindMetPlayerRowToggles", () => {
  it("expands the tapped row on both copies, collapses the previous one, and toggles closed", () => {
    const root = render();
    const state: { expandedSocialPlayerId: string | undefined } = { expandedSocialPlayerId: undefined };
    bindMetPlayerRowToggles(root, state);
    const toggle = (id: string) => root.querySelector<HTMLButtonElement>(`.desktop [data-toggle-player-id="${id}"]`)!.click();

    toggle("p-1");
    expect(state.expandedSocialPlayerId).toBe("p-1");
    expect(expandedIds(root)).toEqual(["p-1", "p-1"]);
    expect(root.querySelector(`.mobile [data-toggle-player-id="p-1"]`)!.getAttribute("aria-expanded")).toBe("true");

    toggle("p-2");
    expect(state.expandedSocialPlayerId).toBe("p-2");
    expect(expandedIds(root)).toEqual(["p-2", "p-2"]);

    toggle("p-2");
    expect(state.expandedSocialPlayerId).toBeUndefined();
    expect(expandedIds(root)).toEqual([]);
  });

  it("tapping the row's status area expands it, but tapping the player's name does not", () => {
    const root = render();
    const state: { expandedSocialPlayerId: string | undefined } = { expandedSocialPlayerId: undefined };
    bindMetPlayerRowToggles(root, state);

    root.querySelector<HTMLButtonElement>('.desktop [data-player-name-id="p-1"]')!.click();
    expect(state.expandedSocialPlayerId).toBeUndefined();

    root.querySelector<HTMLElement>('.desktop [data-player-row-id="p-1"] .alliance-player-status')!.click();
    expect(state.expandedSocialPlayerId).toBe("p-1");
  });

  it("keeps the expanded row open across a re-render from state", () => {
    const state: { expandedSocialPlayerId: string | undefined } = { expandedSocialPlayerId: undefined };
    const first = render();
    bindMetPlayerRowToggles(first, state);
    first.querySelector<HTMLButtonElement>('[data-toggle-player-id="p-2"]')!.click();

    const rerendered = render(state.expandedSocialPlayerId);
    expect(expandedIds(rerendered)).toEqual(["p-2", "p-2"]);
  });
});
