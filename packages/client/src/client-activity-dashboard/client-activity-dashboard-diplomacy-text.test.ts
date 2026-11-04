import type { PersonalActivityDiplomacyCard, PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { chronicleHtml, cardCounterparties } from "../client-hud-v2/client-hud-v2-chronicle.js";
import { activityCardCoordinates, activityCardText } from "./client-activity-dashboard-format.js";
import { activityCardTone } from "./client-activity-dashboard-tone.js";

const card = (overrides: Partial<PersonalActivityDiplomacyCard>): PersonalActivityDiplomacyCard => ({
  kind: "DIPLOMACY",
  id: "diplomacy:TRUCE_ENDED:p2:1000",
  occurredAt: 1_000,
  event: "TRUCE_ENDED",
  counterpartyPlayerId: "p2",
  counterpartyName: "Tove",
  ...overrides
});

const noNames = (): string | undefined => undefined;

describe("diplomacy timeline rows", () => {
  it("reads each truce and alliance change from the viewer's side", () => {
    expect(activityCardText(card({}), "me", noNames)).toBe("Truce with Tove ended");
    expect(activityCardText(card({ event: "TRUCE_STARTED", durationHours: 12 }), "me", noNames)).toBe("Truce with Tove began · 12h");
    expect(activityCardText(card({ event: "TRUCE_STARTED", durationHours: 12, court: true }), "me", noNames)).toBe("Court armistice with Tove began · 12h");
    expect(activityCardText(card({ event: "TRUCE_BROKEN", byPlayerId: "p2" }), "me", noNames)).toBe("Tove broke your truce");
    expect(activityCardText(card({ event: "TRUCE_BROKEN", byPlayerId: "me" }), "me", noNames)).toBe("You broke the truce with Tove");
    expect(activityCardText(card({ event: "ALLIANCE_FORMED" }), "me", noNames)).toBe("Alliance with Tove formed");
    expect(activityCardText(card({ event: "ALLIANCE_BROKEN" }), "me", noNames)).toBe("Alliance with Tove ended");
  });

  it("prefers the live roster name over the name stored on the card", () => {
    expect(activityCardText(card({}), "me", (id) => (id === "p2" ? "Tove the Bold" : undefined))).toBe("Truce with Tove the Bold ended");
  });

  it("colours a betrayal as a loss and a new pact as ground held", () => {
    expect(activityCardTone(card({ event: "TRUCE_BROKEN", byPlayerId: "p2" }), "me")).toBe("loss");
    expect(activityCardTone(card({ event: "TRUCE_BROKEN", byPlayerId: "me" }), "me")).toBe("neutral");
    expect(activityCardTone(card({ event: "ALLIANCE_FORMED" }), "me")).toBe("hold");
    expect(activityCardTone(card({}), "me")).toBe("neutral");
  });

  it("has no map location, so the Chronicle shows no Show button", () => {
    expect(activityCardCoordinates(card({}))).toBeUndefined();
    expect(cardCounterparties(card({}), "me")).toEqual(["p2"]);
    const timeline = {
      playerId: "me",
      from: 0,
      to: 2_000,
      summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
      goldPlundered: 0,
      goldRaidedFromYou: 0,
      manpowerSpentAttacking: 0,
      cards: [card({})]
    } as unknown as PersonalActivityTimeline;
    const html = chronicleHtml({
      me: "me", timeline, loading: false, error: undefined, rivalFilter: "", selectedId: undefined,
      nameOf: noNames, colorOf: () => undefined, techName: () => undefined, nowMs: 2_000
    });
    expect(html).toContain("Truce with Tove ended");
    expect(html).not.toContain("data-v2-chronicle-show");
    expect(html).not.toContain("undefined");
  });
});
