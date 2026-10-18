// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { alliancePanelHtml } from "./client-alliance-panel.js";
import { applyPlayerNameColors, bindAlliancePlayerRows } from "./client-alliance-player-links.js";
import { fallbackOwnerColor } from "../client-owner-colors/client-owner-colors.js";

const names: Record<string, string> = { "p-1": "Hugo", "p-2": "Maren" };

const render = (): HTMLElement => {
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
    nowMs: 0
  });
  const root = document.createElement("div");
  root.innerHTML = `<section class="alliance-panel"><div>${html}</div><div class="alliance-player-inspect-slot"></div></section>`;
  return root;
};

const nameButton = (root: HTMLElement, id: string): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>(`button[data-inspect-player="${id}"]`)!;

describe("alliance player name links", () => {
  it("opens the tapped player's card, closes it on a second tap, and leaves the row collapsed", () => {
    const root = render();
    const state = { playerColors: new Map<string, string>(), socialInspectPlayerId: "", expandedSocialPlayerId: undefined as string | undefined };
    const rerender = vi.fn();
    bindAlliancePlayerRows(root, state, rerender);

    nameButton(root, "p-1").click();
    expect(state.socialInspectPlayerId).toBe("p-1");
    expect(rerender).toHaveBeenCalledTimes(1);
    expect(state.expandedSocialPlayerId).toBeUndefined();

    nameButton(root, "p-2").click();
    expect(state.socialInspectPlayerId).toBe("p-2");

    nameButton(root, "p-2").click();
    expect(state.socialInspectPlayerId).toBe("");
  });

  it("paints each name with the player's colour, falling back to the map's hue when none is assigned", () => {
    const root = render();
    root.insertAdjacentHTML("beforeend", `<strong data-player-color-id="p-1">Hugo</strong>`);
    applyPlayerNameColors(root, new Map([["p-1", "#d94f30"]]));

    expect(nameButton(root, "p-1").style.getPropertyValue("--player-color")).toBe("#d94f30");
    expect(nameButton(root, "p-1").classList.contains("has-player-color")).toBe(true);
    expect(nameButton(root, "p-2").style.getPropertyValue("--player-color")).toBe(fallbackOwnerColor("p-2"));
    expect(root.querySelector<HTMLElement>("[data-player-color-id]")!.style.getPropertyValue("--player-color")).toBe("#d94f30");
  });
});
