// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseChargeView, HouseChargesPayload } from "@border-empires/shared";
import { HOUSE_CHARGES_POINTER_MS, resetHouseChargesBubbleForTests, syncHouseChargesBubble } from "./client-house-charges-bubble.js";

const charge = (id: string, kept: boolean): HouseChargeView => ({
  id,
  kind: "SURVEY",
  title: `Survey ${id}`,
  rarity: "COMMON",
  renown: 1,
  kept,
  held: false,
  size: 0,
  searchCircle: { x: 5, y: 5, radius: 10 },
  targets: []
});
/** As dealt: the server keeps the first two until the House chooses. */
const dealAt = (dealtAt: number): HouseChargesPayload => ({
  type: "HOUSE_CHARGES",
  dealtAt,
  choiceClosesAt: dealtAt + 90_000,
  charges: [charge("a", true), charge("b", true), charge("c", false)]
});
const root = () => document.getElementById("house-charges-bubble");
const sealedNoteShown = () => root()?.textContent?.includes("sealed charges") === true;
/** A page reload: in-memory flags go, storage stays. */
const reload = () => {
  document.body.innerHTML = "";
  resetHouseChargesBubbleForTests();
};

// Playtest 2026-11-26 (several personas, every session): "Your House has handed you 3 sealed charges. Keep 2."
// kept coming back over the map after sheets closed and across sessions, even after the charges had been
// opened and kept. The seen flag was one device-wide key holding a single deal, so a second House on the same
// device overwrote it, and nothing the server already sent (a changed keep) counted as seen.
describe("sealed charges bubble: once seen, gone for that deal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    reload();
  });

  it("does not come back after an overlay closes or a reload, even when another House used this device", () => {
    const deal1 = dealAt(1_000);
    syncHouseChargesBubble({ me: "p1", houseCharges: deal1, activePanel: "charges" }, 2_000, false, () => {});
    syncHouseChargesBubble({ me: "p1", houseCharges: deal1, activePanel: "economy" }, 2_250, false, () => {});
    syncHouseChargesBubble({ me: "p1", houseCharges: deal1, activePanel: null }, 2_500, false, () => {});
    expect(sealedNoteShown()).toBe(false);
    // A second account signs in on the same device and opens its own deal.
    reload();
    syncHouseChargesBubble({ me: "p2", houseCharges: dealAt(1_500), activePanel: "charges" }, 3_000, false, () => {});
    reload();
    syncHouseChargesBubble({ me: "p1", houseCharges: deal1, activePanel: null }, 4_000, false, () => {});
    expect(root()?.classList.contains("is-docked")).toBe(true);
    expect(sealedNoteShown()).toBe(false);
  });

  it("a keep the server already confirmed counts as seen, also with fresh storage", () => {
    const chosen = { ...dealAt(1_000), charges: [charge("a", true), charge("b", false), charge("c", true)] };
    syncHouseChargesBubble({ me: "p1", houseCharges: chosen, activePanel: null }, 2_000, false, () => {});
    expect(root()?.classList.contains("is-docked")).toBe(true);
    expect(sealedNoteShown()).toBe(false);
  });

  it("comes back for a genuinely new deal", () => {
    syncHouseChargesBubble({ me: "p1", houseCharges: dealAt(1_000), activePanel: "charges" }, 2_000, false, () => {});
    reload();
    syncHouseChargesBubble({ me: "p1", houseCharges: dealAt(50_000), activePanel: null }, 51_000, false, () => {});
    expect(sealedNoteShown()).toBe(true);
    // Another House's deal on this device is new for that House too.
    reload();
    syncHouseChargesBubble({ me: "p2", houseCharges: dealAt(1_000), activePanel: null }, 2_000, false, () => {});
    expect(sealedNoteShown()).toBe(true);
  });

  it("closing the note counts as seen: the cards dock and point once to where charges live", () => {
    const deal1 = dealAt(1_000);
    const state = { me: "p1", houseCharges: deal1, activePanel: null };
    syncHouseChargesBubble(state, 2_000, false, () => {});
    root()!.querySelector<HTMLButtonElement>("[data-hcb-action='dismiss-speech']")!.click();
    syncHouseChargesBubble(state, 2_250, false, () => {});
    expect(sealedNoteShown()).toBe(false);
    expect(root()?.classList.contains("is-docked")).toBe(true);
    expect(root()?.querySelector(".hcb-pointer")?.textContent?.trim()).toBe("Charges live here");
    expect(root()?.querySelector(".hcb-orb.is-pointing")).not.toBeNull();
    syncHouseChargesBubble(state, 2_250 + HOUSE_CHARGES_POINTER_MS, false, () => {});
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
    expect(root()?.querySelector(".is-pointing")).toBeNull();
    // Once per account: not again after a reload, nor for the next deal.
    reload();
    syncHouseChargesBubble(state, 9_000, false, () => {});
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
    reload();
    const deal2 = dealAt(50_000);
    syncHouseChargesBubble({ me: "p1", houseCharges: deal2, activePanel: "charges" }, 51_000, false, () => {});
    syncHouseChargesBubble({ me: "p1", houseCharges: deal2, activePanel: null }, 52_000, false, () => {});
    expect(root()?.classList.contains("is-docked")).toBe(true);
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
  });

  // Playtest 2026-11-26: one persona's tap to close the note went through to another screen.
  it("a tap on the note's x never reaches the map or other controls", () => {
    const seen: string[] = [];
    const types = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"] as const;
    for (const type of types) {
      document.addEventListener(type, () => seen.push(`document:${type}`));
      window.addEventListener(type, () => seen.push(`window:${type}`));
    }
    syncHouseChargesBubble({ me: "p1", houseCharges: dealAt(1_000), activePanel: null }, 2_000, false, () => {});
    const close = root()!.querySelector<HTMLButtonElement>("[data-hcb-action='dismiss-speech']")!;
    for (const type of types.slice(0, -1)) close.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    close.dispatchEvent(click);
    expect(seen).toEqual([]);
    expect(click.defaultPrevented).toBe(true);
  });
});
