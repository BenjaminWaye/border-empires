import { describe, expect, it, vi } from "vitest";
import { handleSetHintStateMessage, hintStateInitFields, type StoredHintState } from "./handle-set-hint-state-message.js";

const run = async (dashboardQuietedSeasonId: unknown) => {
  const setHintState = vi.fn(async (_playerId: string, patch: StoredHintState) => patch);
  const sendJson = vi.fn();
  await handleSetHintStateMessage({
    playerId: "p1",
    dismissedHints: undefined,
    hintsMuted: undefined,
    onboardingChecklistCompleted: undefined,
    musterUnlockedSeasonId: undefined,
    dashboardQuietedSeasonId,
    profileStore: { setHintState },
    invalidateProfileCache: vi.fn(),
    sendJson
  });
  return { setHintState, sendJson };
};

describe("dashboardQuietedSeasonId hint state", () => {
  it("defaults to empty on a fresh profile and reflects a stored season in INIT fields", () => {
    expect(hintStateInitFields(undefined).dashboardQuietedSeasonId).toBe("");
    expect(hintStateInitFields({ dashboardQuietedSeasonId: "season-3" }).dashboardQuietedSeasonId).toBe("season-3");
  });

  it("persists a season id and echoes it on HINT_STATE_SET", async () => {
    const { setHintState, sendJson } = await run("season-3");
    expect(setHintState).toHaveBeenCalledWith("p1", { dashboardQuietedSeasonId: "season-3" });
    expect(sendJson).toHaveBeenCalledWith(expect.objectContaining({ type: "HINT_STATE_SET", dashboardQuietedSeasonId: "season-3" }));
  });

  it("ignores an empty or non-string value", async () => {
    for (const bad of ["", 7, undefined]) {
      const { setHintState } = await run(bad);
      expect(setHintState).toHaveBeenCalledWith("p1", {});
    }
  });
});
