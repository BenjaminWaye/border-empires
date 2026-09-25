// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderClientGuideOverlay } from "./client-guide-overlay.js";

const makeState = (overrides: Partial<{ open: boolean; activityDashboardOpen: boolean; changelogOpen: boolean }> = {}) => ({
  guide: { open: overrides.open ?? true, stepIndex: 0, completed: false, autoOpened: false },
  authSessionReady: true,
  profileSetupRequired: false,
  changelog: { open: overrides.changelogOpen ?? false, seenAt: 0, scrollTop: 0 },
  activityDashboard: { open: overrides.activityDashboardOpen ?? false }
});

describe("renderClientGuideOverlay overlay priority", () => {
  it("shows the guide when nothing else is competing for it", () => {
    const guideOverlayEl = document.createElement("div");
    renderClientGuideOverlay({ state: makeState(), guideOverlayEl, storageSet: vi.fn(), renderHud: vi.fn() });
    expect(guideOverlayEl.style.display).toBe("grid");
  });

  it("hides the guide while the Activity dashboard is open, even though guide.open is true", () => {
    const guideOverlayEl = document.createElement("div");
    guideOverlayEl.innerHTML = "<div>stale</div>";
    renderClientGuideOverlay({
      state: makeState({ activityDashboardOpen: true }),
      guideOverlayEl,
      storageSet: vi.fn(),
      renderHud: vi.fn()
    });
    expect(guideOverlayEl.style.display).toBe("none");
    expect(guideOverlayEl.innerHTML).toBe("");
  });

  it("still hides the guide while the changelog is open, unaffected by the new gate", () => {
    const guideOverlayEl = document.createElement("div");
    renderClientGuideOverlay({
      state: makeState({ changelogOpen: true }),
      guideOverlayEl,
      storageSet: vi.fn(),
      renderHud: vi.fn()
    });
    expect(guideOverlayEl.style.display).toBe("none");
  });
});
