import { describe, expect, it } from "vitest";
import { wirePlayerProfileOverlay } from "./client-player-profile.js";

describe("wirePlayerProfileOverlay badge toggle", () => {
  it("opens a profile on press and closes it when the same badge is pressed again", () => {
    const badge = { dataset: { playerNameId: "p1" }, onclick: null as null | (() => void) } as unknown as HTMLElement;
    const none = { forEach: () => {} };
    const dom = {
      hud: { querySelectorAll: () => [badge] },
      playerProfileOverlayEl: { querySelectorAll: () => none }
    } as unknown as Parameters<typeof wirePlayerProfileOverlay>[0];
    const state = { activePlayerProfileId: undefined as string | undefined };
    wirePlayerProfileOverlay(dom, state, () => {});

    (badge.onclick as unknown as () => void)();
    expect(state.activePlayerProfileId).toBe("p1");
    (badge.onclick as unknown as () => void)();
    expect(state.activePlayerProfileId).toBeUndefined();
  });
});
