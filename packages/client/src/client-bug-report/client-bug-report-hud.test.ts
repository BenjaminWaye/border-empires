// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { openReportDialog, renderBugReportOverlay } from "./client-bug-report-hud.js";
import { setReportOpen } from "./client-bug-report.js";

describe("report dialog dismissal", () => {
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.body.replaceChildren();
    setReportOpen("bug", false);
    setReportOpen("suggestion", false);
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

    const overlay = document.getElementById(overlayId)!;
    expect(overlay.getAttribute("data-open")).toBe("true");

    overlay.querySelector<HTMLButtonElement>(".bug-report-actions [data-bug-report-cancel]")!.click();

    expect(overlay.hasAttribute("data-open")).toBe(false);
  });

  it("mounts on <body>, above the full-screen loading/auth overlays, not inside #hud", async () => {
    const hud = document.createElement("div");
    hud.innerHTML = `<button type="button" data-settings-report-bug>Report Bug</button>`;
    document.body.append(hud);
    const state = createInitialState();
    const renderHud = (): void => renderBugReportOverlay({ state, dom: { hud }, wsUrl: "ws://localhost:3101/ws", renderHud });
    renderHud();
    hud.querySelector<HTMLButtonElement>("[data-settings-report-bug]")!.click();
    const overlay = document.getElementById("bug-report-overlay")!;
    expect(overlay.parentElement).toBe(document.body);
    expect(hud.contains(overlay)).toBe(false);
  });

  it("opens and closes from a pre-HUD screen with no HUD render loop (auth-busy Report bug)", async () => {
    const state = createInitialState();
    openReportDialog({ kind: "bug", state, wsUrl: "ws://localhost:3101/ws" });
    await new Promise(requestAnimationFrame);
    const overlay = document.getElementById("bug-report-overlay")!;
    expect(overlay.getAttribute("data-open")).toBe("true");
    expect(overlay.querySelector("[data-bug-report-submit]")).not.toBeNull();

    overlay.querySelector<HTMLButtonElement>(".bug-report-actions [data-bug-report-cancel]")!.click();
    expect(overlay.hasAttribute("data-open")).toBe(false);
  });

  it("warns that the description may be public, and offers a diagnostics download when sending fails", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    try {
      openReportDialog({ kind: "bug", state: createInitialState(), wsUrl: "ws://localhost:3101/ws" });
      const overlay = document.getElementById("bug-report-overlay")!;
      expect(overlay.querySelector(".bug-report-hint")?.textContent).toContain("posted publicly");
      const fallback = overlay.querySelector<HTMLButtonElement>("[data-bug-report-download]")!;
      expect(fallback.hidden).toBe(true);

      overlay.querySelector<HTMLTextAreaElement>("[data-bug-report-description]")!.value = "gateway down";
      overlay.querySelector<HTMLButtonElement>("[data-bug-report-submit]")!.click();
      await vi.waitFor(() => expect(fallback.hidden).toBe(false));
      expect(overlay.querySelector("[data-bug-report-status]")?.textContent).toContain("Failed");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
