// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hideEffortConfirmSheet, isEffortConfirmSheetOpen } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { describeAdvanceEffort, promptMusterAdvanceEffort } from "./client-muster-advance-effort.js";

const click = (selector: string): void => {
  document.querySelector<HTMLButtonElement>(selector)?.click();
};

afterEach(() => hideEffortConfirmSheet());

describe("promptMusterAdvanceEffort", () => {
  it("opens the effort sheet instead of switching to ADVANCE straight away", () => {
    const sendGameMessage = vi.fn(() => true);
    promptMusterAdvanceEffort(4, 7, { sendGameMessage });
    expect(isEffortConfirmSheetOpen()).toBe(true);
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["normal", 60],
    ["extra", 90],
    ["double", 120]
  ])("sends SET_MUSTER ADVANCE with the %s effort's commitment", (preset, commitManpower) => {
    const sendGameMessage = vi.fn(() => true);
    const onSent = vi.fn();
    promptMusterAdvanceEffort(4, 7, { sendGameMessage, onSent });
    click(`[data-effort-preset="${preset}"]`);
    click("[data-effort-go]");
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 4, y: 7, mode: "ADVANCE", commitManpower });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(isEffortConfirmSheetOpen()).toBe(false);
  });

  it("sends nothing when the sheet is cancelled", () => {
    const sendGameMessage = vi.fn(() => true);
    promptMusterAdvanceEffort(4, 7, { sendGameMessage });
    click("[data-effort-cancel]");
    expect(sendGameMessage).not.toHaveBeenCalled();
  });
});

describe("describeAdvanceEffort", () => {
  it("explains the odds boost for Extra and Double", () => {
    expect(describeAdvanceEffort("normal")).toContain("just its target's floor");
    expect(describeAdvanceEffort("extra")).toContain("×1.5 odds");
    expect(describeAdvanceEffort("double")).toContain("×2 odds");
  });
});
