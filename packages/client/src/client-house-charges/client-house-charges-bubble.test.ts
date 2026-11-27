// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseChargeView, HouseChargesPayload } from "@border-empires/shared";
import { HOUSE_CHARGES_POINTER_MS, houseChargesUnhandled, resetHouseChargesBubbleForTests, syncHouseChargesBubble } from "./client-house-charges-bubble.js";

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

  it("tapping the cards opens the Charges panel and the bubble does not come back; the cards dock instead", () => {
    const open = vi.fn();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, false, open);
    root()!.querySelector<HTMLButtonElement>(".hcb-orb")!.click();
    expect(open).toHaveBeenCalledOnce();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: "charges" }, 2_500, false, open);
    expect(root()).toBeNull();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 3_000, false, open);
    expect(root()?.classList.contains("is-docked")).toBe(true);
    expect(root()?.textContent).not.toContain("sealed charges");
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
    expect(houseChargesUnhandled(deal, 3_000)).toBe(false);
  });

  // Owner 2026-11-19: after the charges have been viewed it was too hard to find them again (crest, profile,
  // Manage charges). The cards stay docked at the map edge as the way back, with a held count.
  it("once opened, the cards stay docked with the held count, and tapping them opens the charges again", () => {
    const open = vi.fn();
    const held = { ...deal, charges: [{ ...charge("a"), held: true }, charge("b"), charge("c")] };
    syncHouseChargesBubble({ houseCharges: held, activePanel: "charges" }, 2_000, false, open);
    syncHouseChargesBubble({ houseCharges: held, activePanel: null }, 3_000, false, open);
    expect(root()?.querySelector(".hcb-badge")?.textContent).toBe("1/2");
    expect(root()?.querySelector(".hcb-orb")?.getAttribute("aria-label")).toBe("Your House charges: 1 of 2 held");
    root()!.querySelector<HTMLButtonElement>(".hcb-orb")!.click();
    expect(open).toHaveBeenCalledOnce();
  });

  it("the first time the cards dock, a pointer says where charges live, then it goes for good", () => {
    const open = vi.fn();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: "charges" }, 2_000, false, open);
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 3_000, false, open);
    expect(root()?.querySelector(".hcb-pointer")?.textContent).toBe("Charges live here");
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 3_000 + HOUSE_CHARGES_POINTER_MS, false, open);
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
    resetHouseChargesBubbleForTests();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 99_000, false, open);
    expect(root()?.querySelector(".hcb-orb.is-docked")).not.toBeNull();
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
  });

  // Review of #2875: the note fired on the first docked frame, so a House whose choice closed unseen, or one dealt
  // only two charges, was told its charges "stay here" before it had ever seen them.
  it("the pointer waits until the charges have been opened, even with nothing to choose", () => {
    const open = vi.fn();
    const pair = { ...deal, charges: [charge("a"), charge("b")] };
    syncHouseChargesBubble({ houseCharges: pair, activePanel: null }, 2_000, false, open);
    expect(root()?.classList.contains("is-docked")).toBe(true);
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 95_000, false, open);
    expect(root()?.querySelector(".hcb-pointer")).toBeNull();
    syncHouseChargesBubble({ houseCharges: pair, activePanel: "charges" }, 3_000, false, open);
    syncHouseChargesBubble({ houseCharges: pair, activePanel: null }, 4_000, false, open);
    expect(root()?.textContent).toContain("Charges live here");
  });

  it("opening the Charges panel another way also handles the deal", () => {
    syncHouseChargesBubble({ houseCharges: deal, activePanel: "charges" }, 2_000, false, () => {});
    expect(houseChargesUnhandled(deal, 2_000)).toBe(false);
  });

  it("hides over screens and panels, and only docks after the choice closes or with nothing to choose", () => {
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 2_000, true, () => {});
    expect(root()).toBeNull();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: "economy" }, 2_000, false, () => {});
    expect(root()).toBeNull();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 90_000, false, () => {});
    expect(root()?.classList.contains("is-docked")).toBe(true);
    syncHouseChargesBubble({ houseCharges: { ...deal, charges: [charge("a"), charge("b")] }, activePanel: null }, 2_000, false, () => {});
    expect(root()?.classList.contains("is-docked")).toBe(true);
    syncHouseChargesBubble({ houseCharges: { ...deal, charges: [] }, activePanel: null }, 2_000, false, () => {});
    expect(root()).toBeNull();
    syncHouseChargesBubble({ houseCharges: null, activePanel: null }, 2_000, false, () => {});
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
    expect(root()?.classList.contains("is-docked")).toBe(true);
  });

  it("reads storage once per deal, not on every frame", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    for (let t = 2_000; t < 4_000; t += 250) syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, t, false, () => {});
    expect(getItem.mock.calls.length).toBeLessThanOrEqual(3);
  });

  // Owner 2026-11-19: after Show on map there had to be an easy way back to the cards.
  it("while a charge is shown on the map, the docked cards offer Back to cards and an x that clears it", () => {
    const open = vi.fn();
    const refresh = vi.fn();
    const state = { houseCharges: deal, activePanel: null as string | null, houseChargeFocusId: "a" as string | undefined };
    syncHouseChargesBubble({ ...state, activePanel: "charges" }, 2_000, false, open);
    syncHouseChargesBubble(state, 3_000, false, open, refresh);
    expect(root()?.querySelector(".hcb-focus")?.textContent).toContain("Showing: Survey a");
    root()!.querySelector<HTMLButtonElement>(".hcb-focus .hcb-speech-open")!.click();
    expect(open).toHaveBeenCalledOnce();
    syncHouseChargesBubble(state, 3_250, false, open, refresh);
    root()!.querySelector<HTMLButtonElement>("[data-hcb-action='clear-focus']")!.click();
    expect(state.houseChargeFocusId).toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
    expect(root()?.querySelector(".hcb-focus")).toBeNull();
  });

  // Review of #2876: the focus note hid the first-dock note while still marking it seen, so it never showed.
  it("keeps the one-time pointer for later while a charge is shown on the map", () => {
    const open = vi.fn();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: "charges" }, 2_000, false, open);
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null, houseChargeFocusId: "a" }, 3_000, false, open);
    expect(root()?.querySelector(".hcb-focus")).not.toBeNull();
    syncHouseChargesBubble({ houseCharges: deal, activePanel: null }, 4_000, false, open);
    expect(root()?.textContent).toContain("Charges live here");
  });
});
