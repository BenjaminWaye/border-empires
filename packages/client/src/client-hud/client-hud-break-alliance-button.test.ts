// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { bindBreakAllianceButton } from "./client-hud-break-alliance-button.js";
import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";

// Breaking an alliance starts a 24h notice rather than breaking it instantly
// (ALLIANCE_BREAK_NOTICE_MS in social-state.ts), so the button confirms with
// the player first instead of firing ALLIANCE_BREAK straight from the click.
describe("bindBreakAllianceButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeButton = (targetPlayerId: string): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.dataset.allianceBreakPlayerId = targetPlayerId;
    btn.dataset.allianceBreakPlayerName = "Alden";
    return btn;
  };

  // Playtest Run 4: window.confirm can be dropped silently in an in-app browser, so the tap did nothing.
  it("confirms with the in-game pact sheet, never window.confirm, and sends ALLIANCE_BREAK on confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const sheets: BreakPactSheetOptions[] = [];
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const btn = makeButton("player-2");

    bindBreakAllianceButton(btn, sendGameMessage, (options) => { sheets.push(options); return true; });
    btn.onclick?.(new PointerEvent("click"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.title).toBe("Break alliance with Alden?");
    expect(sheets[0]?.consequences.join(" ")).toContain("24 hours");
    expect(sendGameMessage).not.toHaveBeenCalled();
    sheets[0]?.onConfirm();
    expect(sendGameMessage).toHaveBeenCalledWith(
      { type: "ALLIANCE_BREAK", targetPlayerId: "player-2" },
      "Finish sign-in before breaking alliances."
    );
  });

  it("does not send ALLIANCE_BREAK until the sheet is confirmed", () => {
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const btn = makeButton("player-2");

    bindBreakAllianceButton(btn, sendGameMessage, () => true);
    btn.onclick?.(new PointerEvent("click"));

    expect(sendGameMessage).not.toHaveBeenCalled();
  });
});
