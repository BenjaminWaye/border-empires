import { describe, expect, it, vi } from "vitest";
import { handleSetHintStateMessage, hintStateInitFields, type StoredHintState } from "./handle-set-hint-state-message.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";

const run = async (guideStatus: unknown, guideSteps: unknown) => {
  const setHintState = vi.fn(async (_playerId: string, patch: StoredHintState) => patch);
  const sendJson = vi.fn();
  await handleSetHintStateMessage({
    playerId: "p1",
    dismissedHints: undefined,
    hintsMuted: undefined,
    onboardingChecklistCompleted: undefined,
    musterUnlockedSeasonId: undefined,
    guideStatus,
    guideSteps,
    profileStore: { setHintState },
    invalidateProfileCache: vi.fn(),
    sendJson
  });
  return { setHintState, sendJson };
};

describe("tutorial guide hint state", () => {
  it("defaults to no guide on a fresh or pre-guide profile", () => {
    expect(hintStateInitFields(undefined)).toEqual(expect.objectContaining({ guideStatus: "", guideSteps: [] }));
    expect(hintStateInitFields({ guideStatus: "active", guideSteps: ["look-pan"] })).toEqual(
      expect.objectContaining({ guideStatus: "active", guideSteps: ["look-pan"] })
    );
  });

  it("persists a valid status and step list and echoes them on HINT_STATE_SET", async () => {
    const { setHintState, sendJson } = await run("active", ["look-pan", "look-select"]);
    expect(setHintState).toHaveBeenCalledWith("p1", { guideStatus: "active", guideSteps: ["look-pan", "look-select"] });
    expect(sendJson).toHaveBeenCalledWith(expect.objectContaining({ type: "HINT_STATE_SET", guideStatus: "active" }));
  });

  it("drops an unknown status and an oversized or malformed step list", async () => {
    const tooMany = Array.from({ length: 65 }, (_, i) => `s${i}`);
    for (const [status, steps] of [["started", tooMany], [7, ["x".repeat(49)]], [undefined, [1, 2]]] as const) {
      const { setHintState } = await run(status, steps);
      expect(setHintState).toHaveBeenCalledWith("p1", {});
    }
  });

  it("keeps guide progress across unrelated profile writes in the in-memory store", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setHintState("p1", { guideStatus: "active", guideSteps: ["look-pan"] });
    await store.setHintState("p1", { hintsMuted: true });
    await store.setEmailNotificationPrefs("p1", { attackAlert: false });
    await store.setActivitySeen("p1", 1, "season-1");
    await expect(store.get("p1")).resolves.toEqual(expect.objectContaining({ guideStatus: "active", guideSteps: ["look-pan"], hintsMuted: true }));
  });
});
