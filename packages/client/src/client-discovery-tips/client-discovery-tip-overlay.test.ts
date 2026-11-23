// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announceDiscoveryTip, discoveryTipPins, openDiscoveryTipPin, renderDiscoveryTipOverlay, resetDiscoveryTipPinsForTests } from "./client-discovery-tip-overlay.js";
import { DISCOVERY_TIPS, enqueueDiscoveryTip, type DiscoveryTipId } from "./client-discovery-tips.js";
import { isDiscoveryTipSeen } from "./client-discovery-tips-storage.js";

const card = (): HTMLElement | null => document.getElementById("discovery-tip-overlay");

/** A queue holding `id` with a target tile, as every live enqueue path builds it. */
const queued = (id: DiscoveryTipId, at = { x: 4, y: 6 }): DiscoveryTipId[] => {
  const queue: DiscoveryTipId[] = [];
  enqueueDiscoveryTip(queue, id, "a@example.com", at);
  return queue;
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  resetDiscoveryTipPinsForTests();
});

describe("discovery tips as map pins", () => {
  // Owner, 2026-11-21: the card that opened on its own over the map got in the way of play.
  it("pins a tip at its tile instead of opening a card", () => {
    renderDiscoveryTipOverlay(queued("TOWN"), "a@example.com", vi.fn());

    expect(discoveryTipPins()).toEqual([{ id: "TOWN", x: 4, y: 6 }]);
    expect(card()).toBeNull();
  });

  it("records each tip in the Chronicle once, when its pin first appears", () => {
    const queue = queued("TOWN");
    const onShow = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith(DISCOVERY_TIPS.TOWN);
  });

  it("sends a tip with no tile straight to the Chronicle and dismisses it", () => {
    const queue: DiscoveryTipId[] = [];
    enqueueDiscoveryTip(queue, "FIRST_MUSTER", "a@example.com");
    const onShow = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);

    expect(onShow).toHaveBeenCalledWith(DISCOVERY_TIPS.FIRST_MUSTER);
    expect(queue).toEqual([]);
    expect(discoveryTipPins()).toEqual([]);
    expect(card()).toBeNull();
  });

  it("shows no pins while muted or deferred, and keeps the queue", () => {
    const queue = queued("TOWN");
    const onShow = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow, true);
    expect(discoveryTipPins()).toEqual([]);

    window.localStorage.setItem("be-discovery-tips-muted-until:a@example.com", String(Date.now() + 60_000));
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), onShow);
    expect(discoveryTipPins()).toEqual([]);
    expect(onShow).not.toHaveBeenCalled();
    expect(queue).toEqual(["TOWN"]);
  });

  it("opens the card on a pin tap; Got it dismisses that tip and removes its pin", () => {
    const queue = queued("TOWN");
    enqueueDiscoveryTip(queue, "DOCK", "a@example.com", { x: 9, y: 2 });
    const onDismiss = vi.fn();
    renderDiscoveryTipOverlay(queue, "a@example.com", onDismiss);

    openDiscoveryTipPin("DOCK");
    expect(document.getElementById("discovery-tip-title")?.textContent).toBe(DISCOVERY_TIPS.DOCK.title);
    expect(document.getElementById("discovery-tip-center")).toBeNull();
    (document.getElementById("discovery-tip-ack") as HTMLButtonElement).click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
    expect(queue).toEqual(["TOWN"]);
    expect(discoveryTipPins()).toEqual([{ id: "TOWN", x: 4, y: 6 }]);
  });

  // Review 2026-11-23: muting from one card left the other pins up until the next tile batch.
  it("takes every pin off the map when Don't show tips is ticked on a card", () => {
    const queue = queued("TOWN");
    enqueueDiscoveryTip(queue, "DOCK", "a@example.com", { x: 9, y: 2 });
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn());
    openDiscoveryTipPin("DOCK");
    (document.getElementById("discovery-tip-mute") as HTMLInputElement).checked = true;
    (document.getElementById("discovery-tip-ack") as HTMLButtonElement).click();
    expect(discoveryTipPins()).toEqual([]);
  });

  // Review 2026-11-23: an untapped pin was never marked seen, so each session queued and recorded it again.
  it("counts a tip as seen once its pin has been recorded", () => {
    renderDiscoveryTipOverlay(queued("TOWN"), "a@example.com", vi.fn());
    expect(isDiscoveryTipSeen("TOWN", "a@example.com")).toBe(true);
    const nextSession: DiscoveryTipId[] = [];
    expect(enqueueDiscoveryTip(nextSession, "TOWN", "a@example.com", { x: 4, y: 6 })).toBe(false);
  });

  it("closes an open card when the map is covered", () => {
    const queue = queued("TOWN");
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn());
    openDiscoveryTipPin("TOWN");
    expect(card()).not.toBeNull();

    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn(), undefined, true);
    expect(card()).toBeNull();
    expect(queue).toEqual(["TOWN"]);
  });

  it("drops a pin as soon as another path takes its tip out of the queue", () => {
    const queue = queued("WAYSTATION");
    renderDiscoveryTipOverlay(queue, "a@example.com", vi.fn());
    queue.splice(0, 1);
    expect(discoveryTipPins()).toEqual([]);
  });
});

describe("announceDiscoveryTip", () => {
  it("pins a player-action tip at once and records it", () => {
    const queue: DiscoveryTipId[] = [];
    const onShow = vi.fn();
    announceDiscoveryTip(queue, "FIRST_MUSTER", "a@example.com", vi.fn(), onShow, false, { x: 7, y: 9 });

    expect(onShow).toHaveBeenCalledWith(DISCOVERY_TIPS.FIRST_MUSTER);
    expect(discoveryTipPins()).toEqual([{ id: "FIRST_MUSTER", x: 7, y: 9 }]);
  });
});
