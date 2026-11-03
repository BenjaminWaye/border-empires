// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHudV2Sheet, detentHeight, openSheetCount, sheetLetsMapThrough, snapDetent, SHEET_PEEK_PX } from "./client-hud-v2-sheet.js";

const VH = 800;
const ALL = ["peek", "half", "full"] as const;

describe("sheet detents", () => {
  it("sizes peek, half and full from the viewport", () => {
    expect(detentHeight("peek", VH)).toBe(SHEET_PEEK_PX);
    expect(detentHeight("half", VH)).toBe(400);
    expect(detentHeight("full", VH)).toBe(720);
    // A very short viewport (phone in landscape) keeps peek under 40% of the screen.
    expect(detentHeight("peek", 200)).toBe(80);
  });

  it("settles a slow release on the nearest detent", () => {
    expect(snapDetent(380, 0, VH, ALL)).toBe("half");
    expect(snapDetent(650, 0, VH, ALL)).toBe("full");
    expect(snapDetent(150, 0, VH, ALL)).toBe("peek");
  });

  it("flings to the next detent in the direction of a fast release", () => {
    expect(snapDetent(130, 1, VH, ALL)).toBe("half");
    expect(snapDetent(390, -1, VH, ALL)).toBe("peek");
    expect(snapDetent(700, 1, VH, ALL)).toBe("full");
  });

  it("closes when dragged well below the lowest detent or flung down from it", () => {
    expect(snapDetent(40, 0, VH, ALL)).toBe("closed");
    expect(snapDetent(110, -1, VH, ALL)).toBe("closed");
  });

  it("only rests at the detents a sheet allows", () => {
    expect(snapDetent(250, 0, VH, ["half", "full"])).toBe("half");
    expect(snapDetent(100, 0, VH, ["half", "full"])).toBe("closed");
  });

  it("lets the map through at peek and half but not at full", () => {
    expect(sheetLetsMapThrough("peek")).toBe(true);
    expect(sheetLetsMapThrough("half")).toBe(true);
    expect(sheetLetsMapThrough("full")).toBe(false);
  });
});

describe("sheet element and back gesture", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Like a browser, back() fires popstate (asynchronously there; synchronously here).
  const fakeHistory = () => ({ pushState: vi.fn(), back: vi.fn(() => window.dispatchEvent(new PopStateEvent("popstate"))) });

  it("opens at its initial detent and pushes one history entry", () => {
    const history = fakeHistory();
    const sheet = createHudV2Sheet(document.body, { label: "Tile", initial: "half", history });
    expect(sheet.detent()).toBe("half");
    expect(sheet.el.dataset.detent).toBe("half");
    expect(sheet.el.style.getPropertyValue("--v2-sheet-h")).toBe(`${detentHeight("half", window.innerHeight)}px`);
    expect(history.pushState).toHaveBeenCalledTimes(1);
    sheet.close();
  });

  it("closing from the UI removes the sheet and pops its own history entry", () => {
    const history = fakeHistory();
    const onClose = vi.fn();
    const sheet = createHudV2Sheet(document.body, { label: "Tile", history, onClose });
    const before = openSheetCount();
    sheet.close();
    expect(sheet.detent()).toBe("closed");
    expect(document.querySelector(".hud-v2-sheet")).toBeNull();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openSheetCount()).toBe(before - 1);
    // The pop that history.back() causes must not close anything else.
    const other = createHudV2Sheet(document.body, { label: "Chronicle", history });
    expect(other.detent()).toBe("peek");
    const inner = createHudV2Sheet(document.body, { label: "Treasury", history });
    inner.close();
    expect(other.detent()).toBe("peek");
    other.close();
  });

  it("the back gesture closes only the newest sheet", () => {
    const history = fakeHistory();
    const first = createHudV2Sheet(document.body, { label: "Tile", history });
    const second = createHudV2Sheet(document.body, { label: "Treasury", history });
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(second.detent()).toBe("closed");
    expect(first.detent()).toBe("peek");
    // Closed by the back gesture: the browser already popped the entry.
    expect(history.back).not.toHaveBeenCalled();
    first.close();
  });

  it("ignores detents it does not allow and reports changes", () => {
    const onDetentChange = vi.fn();
    const sheet = createHudV2Sheet(document.body, { label: "Town", detents: ["half", "full"], history: fakeHistory(), onDetentChange });
    expect(sheet.detent()).toBe("half");
    sheet.setDetent("peek");
    expect(sheet.detent()).toBe("half");
    sheet.setDetent("full");
    expect(onDetentChange).toHaveBeenCalledWith("full");
    sheet.close();
  });
});
