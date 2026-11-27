// Playtest Run 5: coin rose far faster than the listed rate on return with no
// explanation. The server's WELCOME_BACK message was never shown; it now feeds
// the Chronicle's "Since you last looked" card.
import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMapPushMessage } from "../client-network/client-map-push-messages.js";
import { chronicleHeadlineHtml } from "../client-hud-v2/client-hud-v2-chronicle-headline.js";
import type { ClientState } from "../client-state/client-state.js";
import { applyWelcomeBackMessage, awayDurationText, latestWelcomeBack, resetWelcomeBack, welcomeBackLines } from "./client-welcome-back.js";

const emptyTimeline = (): PersonalActivityTimeline => ({
  playerId: "me", from: 0, to: 1_000,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
  goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0, cards: [], truncated: false
});

const message = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "WELCOME_BACK", elapsedMs: 9 * 3_600_000, goldEarned: 1_240.7, manpowerRefilled: 300, flagsDrawn: 210, incomeCapped: false, at: 2_000, ...extra
});

describe("welcome-back summary", () => {
  beforeEach(() => resetWelcomeBack());

  it("is taken from the WELCOME_BACK push and re-renders the HUD", () => {
    let renders = 0;
    expect(applyMapPushMessage({} as ClientState, message(), () => { renders += 1; })).toBe(true);
    expect(renders).toBe(1);
    expect(latestWelcomeBack()).toMatchObject({ goldEarned: 1_240.7, manpowerRefilled: 300, flagsDrawn: 210, at: 2_000 });
  });

  it("ignores a replayed copy it already holds", () => {
    expect(applyWelcomeBackMessage(message())).toBe(true);
    expect(applyWelcomeBackMessage(message({ goldEarned: 5 }))).toBe(false);
    expect(latestWelcomeBack()?.goldEarned).toBe(1_240.7);
  });

  it("explains coin, refills and flag draws in one terse line, and the 24h limit", () => {
    applyWelcomeBackMessage(message({ incomeCapped: true, elapsedMs: 30 * 3_600_000 }));
    expect(welcomeBackLines(latestWelcomeBack())).toEqual([
      "Away 1d 6h: +1,240 coin · +300 manpower · 210 manpower to flags.",
      "Coin stopped after 24h away."
    ]);
    expect(awayDurationText(45 * 60_000)).toBe("45m");
  });

  it("leads the Since you last looked card, even when nothing else happened", () => {
    applyWelcomeBackMessage(message());
    const html = chronicleHeadlineHtml({ me: "me", timeline: emptyTimeline(), awaySince: 500, nameOf: () => undefined, welcomeBack: latestWelcomeBack() });
    expect(html).toContain("Since you last looked");
    expect(html).toContain("Away 9h: +1,240 coin · +300 manpower · 210 manpower to flags.");
    expect(html).not.toContain("v2c-headline-loss");
  });

  it("is not shown again once the player has read past it", () => {
    applyWelcomeBackMessage(message({ at: 400 }));
    expect(chronicleHeadlineHtml({ me: "me", timeline: emptyTimeline(), awaySince: 500, nameOf: () => undefined, welcomeBack: latestWelcomeBack() })).toBe("");
  });
});
