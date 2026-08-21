// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceDiscoveryTip, renderDiscoveryTipOverlay } from "./client-discovery-tip-overlay.js";
import { DISCOVERY_TIPS, type DiscoveryTipId } from "./client-discovery-tips.js";

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  // `currentOverlayTipId` is module-level singleton state (mirrors the single
  // real toast on screen at a time) — reset it between tests via the
  // empty-queue branch so one test's shown tip doesn't suppress the next.
  renderDiscoveryTipOverlay([], "reset@example.com", vi.fn());
});

afterEach(() => {
  document.getElementById("discovery-tip-overlay")?.remove();
});

describe("renderDiscoveryTipOverlay onShow", () => {
  it("fires onShow once with the tip def when a new toast is first displayed", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    const onShow = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith(DISCOVERY_TIPS.TOWN);
    expect(document.getElementById("discovery-tip-overlay")).not.toBeNull();
  });

  it("does not re-fire onShow on a re-render for the same still-queued tip", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    const onShow = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);

    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("does not fire onShow when the player has muted discovery tips", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    const onShow = vi.fn();
    window.localStorage.setItem(`be-discovery-tips-muted-until:a@example.com`, String(Date.now()));

    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);

    expect(onShow).not.toHaveBeenCalled();
    expect(document.getElementById("discovery-tip-overlay")).toBeNull();
  });

  it("clicking Got it dismisses the toast without calling onShow again", () => {
    const queue: DiscoveryTipId[] = ["TOWN"];
    const onDismiss = vi.fn();
    const onShow = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", onDismiss, onShow);

    (document.getElementById("discovery-tip-ack") as HTMLButtonElement).click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.getElementById("discovery-tip-overlay")).toBeNull();
    expect(queue).toEqual([]);
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});

describe("announceDiscoveryTip onShow", () => {
  it("forwards onShow through to the rendered toast", () => {
    const queue: DiscoveryTipId[] = [];
    const onShow = vi.fn();
    announceDiscoveryTip(queue, "FIRST_MUSTER", "a@example.com", vi.fn(), onShow);

    expect(onShow).toHaveBeenCalledWith(DISCOVERY_TIPS.FIRST_MUSTER);
  });
});
