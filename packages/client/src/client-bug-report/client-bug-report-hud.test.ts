// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { renderBugReportOverlay } from "./client-bug-report-hud.js";

describe("report dialog dismissal", () => {
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.replaceChildren();
  });

  it.each([
    ["Report Bug", "report-bug", "bug-report-overlay"],
    ["Suggest Improvement", "suggest-improvement", "suggestion-overlay"]
  ])("closes the %s dialog from the footer Cancel button", async (label, trigger, overlayId) => {
    const hud = document.createElement("div");
    hud.innerHTML = `<button type="button" data-settings-${trigger}>${label}</button>`;
    document.body.append(hud);

    const state = createInitialState();
    const renderHud = (): void => {
      renderBugReportOverlay({ state, dom: { hud }, wsUrl: "ws://localhost:3101/ws", renderHud });
    };
    renderHud();
    hud.querySelector<HTMLButtonElement>(`[data-settings-${trigger}]`)!.click();
    await new Promise(requestAnimationFrame);

    const overlay = hud.querySelector(`#${overlayId}`)!;
    expect(overlay.getAttribute("data-open")).toBe("true");

    overlay.querySelector<HTMLButtonElement>(".bug-report-actions [data-bug-report-cancel]")!.click();

    expect(overlay.hasAttribute("data-open")).toBe(false);
  });
});
