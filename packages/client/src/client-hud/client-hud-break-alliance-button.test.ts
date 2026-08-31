// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { bindBreakAllianceButton } from "./client-hud-break-alliance-button.js";

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
    return btn;
  };

  it("sends ALLIANCE_BREAK only after the player confirms", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const btn = makeButton("player-2");

    bindBreakAllianceButton(btn, sendGameMessage);
    btn.onclick?.(new PointerEvent("click"));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("24 hours"));
    expect(sendGameMessage).toHaveBeenCalledWith(
      { type: "ALLIANCE_BREAK", targetPlayerId: "player-2" },
      "Finish sign-in before breaking alliances."
    );
  });

  it("does not send ALLIANCE_BREAK when the player cancels the confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const sendGameMessage = vi.fn().mockReturnValue(true);
    const btn = makeButton("player-2");

    bindBreakAllianceButton(btn, sendGameMessage);
    btn.onclick?.(new PointerEvent("click"));

    expect(sendGameMessage).not.toHaveBeenCalled();
  });
});
