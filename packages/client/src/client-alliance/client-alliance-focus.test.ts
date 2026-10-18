// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { alliancePanelHtml } from "./client-alliance-panel.js";
import { applySocialFocus } from "./client-alliance-focus.js";

const render = (): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = alliancePanelHtml({
    metPlayerIds: new Set(["p-1", "p-2"]),
    allies: [],
    activeAllianceBreaks: [],
    activeTruces: [],
    incomingAllianceRequests: [],
    outgoingAllianceRequests: [],
    incomingTruceRequests: [],
    outgoingTruceRequests: [],
    playerNameForOwner: (id) => id ?? undefined,
    playerColors: new Map(),
    nowMs: 0
  });
  document.body.append(root);
  return root;
};

describe("applySocialFocus", () => {
  it("highlights only the focused player's card and scrolls to it once", () => {
    const root = render();
    const scroll = vi.fn();
    for (const card of Array.from(root.querySelectorAll("article")) as HTMLElement[]) card.scrollIntoView = scroll;
    const state = { socialFocus: { playerId: "p-2", until: 1_000, scrollPending: true } };

    applySocialFocus([root], state, 500);

    const highlighted = Array.from(root.querySelectorAll(".alliance-focus-highlight")) as HTMLElement[];
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.querySelector("[data-player-name-id]")!.getAttribute("data-player-name-id")).toBe("p-2");
    expect(scroll).toHaveBeenCalledTimes(1);

    // The HUD rewrites the panel HTML on the next gateway message: still highlighted, no second scroll.
    const rerendered = render();
    for (const card of Array.from(rerendered.querySelectorAll("article")) as HTMLElement[]) card.scrollIntoView = scroll;
    applySocialFocus([rerendered], state, 600);
    expect(rerendered.querySelectorAll(".alliance-focus-highlight")).toHaveLength(1);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("clears the focus once it has expired", () => {
    const root = render();
    const state = { socialFocus: { playerId: "p-2", until: 1_000, scrollPending: true } as { playerId: string; until: number; scrollPending: boolean } | undefined };

    applySocialFocus([root], state, 1_000);

    expect(state.socialFocus).toBeUndefined();
    expect(root.querySelectorAll(".alliance-focus-highlight")).toHaveLength(0);
  });
});
