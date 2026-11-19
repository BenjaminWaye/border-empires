// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseChargeView, HouseChargesPayload } from "@border-empires/shared";
import { houseChargesUnhandled, resetHouseChargesBubbleForTests, syncHouseChargesBubble } from "./client-house-charges-bubble.js";

const charge = (id: string): HouseChargeView => ({
  id,
  kind: "SURVEY",
  title: `Survey ${id}`,
  rarity: "COMMON",
  renown: 1,
  kept: id !== "c",
  held: false,
  size: 0,
  searchCircle: { x: 5, y: 5, radius: 10 },
  targets: []
});
const deal: HouseChargesPayload = { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 90_000, charges: [charge("a"), charge("b"), charge("c")] };
const root = () => document.getElementById("house-charges-bubble");

// Owner 2026-11-18: the "House charges arrived" alert card should be a bobbing bubble of three sealed cards with
// a dismissable "your House has handed you sealed charges" note, staying until the charges are handled.
describe("sealed charges bubble", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.body.innerHTML = "";
    resetHouseChargesBubbleForTests();
  });

  it("shows three illustrated cards and the House's note while the choice is open", () => {
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, false, () => {});
    // Reuses the charge card and the shared map callout rather than restyling them (owner 2026-11-18).
    expect(root()?.querySelectorAll(".hcb-cards .hc-card.is-back.is-mini .sp-cog")).toHaveLength(3);
    expect(root()?.querySelector(".hcb-speech")?.classList.contains("sp-callout")).toBe(true);
    expect(root()?.textContent).toContain("Your House has handed you 3 sealed charges. Keep 2.");
  });

  it("closing the note hides only the text; the cards stay", () => {
    const state = { houseCharges: deal, activePanel: null };
    syncHouseChargesBubble(state, 2_000, false, () => {});
    root()!.querySelector<HTMLButtonElement>("[data-hcb-action='dismiss-speech']")!.click();
    syncHouseChargesBubble(state, 3_000, false, () => {});
    expect(root()?.querySelector(".hcb-speech")).toBeNull();
    expect(root()?.querySelector(".hcb-orb")).not.toBeNull();
  });

  it("tapping the cards opens the Charges panel and the bubble does not come back", () => {
    const open = vi.fn();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, false, open);
    root()!.querySelector<HTMLButtonElement>(".hcb-orb")!.click();
    expect(open).toHaveBeenCalledOnce();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 3_000, false, open);
    expect(root()).toBeNull();
  });

  // Owner 2026-11-19: a player tapped the note twice and it vanished both times, so he never saw his charges.
  // Only the cards opened the panel; a tap on the words did nothing, or was snapped onto the note's x.
  it("tapping the note itself opens the Charges panel, and its x stays apart from the words", () => {
    const open = vi.fn();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, false, open);
    const message = root()!.querySelector<HTMLButtonElement>(".hcb-speech [data-hcb-action='open']");
    expect(message?.textContent).toContain("Your House has handed you 3 sealed charges. Keep 2.");
    expect(message?.contains(root()!.querySelector(".hcb-speech-close"))).toBe(false);
    message!.click();
    expect(open).toHaveBeenCalledOnce();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 3_000, false, open);
    expect(root()).toBeNull();
  });

  it("opening the Charges panel another way also handles the deal", () => {
    syncHouseChargesBubble({ houseCharges: deal, activePanel: "charges" }, 2_000, false, () => {});
    expect(houseChargesUnhandled(deal, 2_000)).toBe(false);
  });

  it("hides over screens, after the choice closes, and when there is nothing to choose", () => {
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, true, () => {});
    expect(root()).toBeNull();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 90_000, false, () => {});
    expect(root()).toBeNull();
    syncHouseChargesBubble({ houseCharges: { ...deal, charges: [charge("a"), charge("b")] }, activePanel: null }, 2_000, false, () => {});
    expect(root()).toBeNull();
    // Still unhandled: it comes back once the screen closes.
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, false, () => {});
    expect(root()).not.toBeNull();
  });

  // Review of #2871: with storage blocked the flags only lived in storage, so x never closed the note and the
  // bubble came back on the next frame after the cards opened the panel.
  it("still closes the note and stays handled when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const state = { houseCharges: deal, activePanel: null };
    syncHouseChargesBubble(state, 2_000, false, () => {});
    root()!.querySelector<HTMLButtonElement>("[data-hcb-action='dismiss-speech']")!.click();
    expect(root()?.querySelector(".hcb-speech")).toBeNull();
    root()!.querySelector<HTMLButtonElement>(".hcb-orb")!.click();
    syncHouseChargesBubble(state, 3_000, false, () => {});
    expect(root()).toBeNull();
  });

  it("reads storage once per deal, not on every frame", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    for (let t = 2_000; t < 4_000; t += 250) syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, t, false, () => {});
    expect(getItem.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
