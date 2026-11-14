import type { PersonalActivitySupplyEndedCard } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { cardCounterparties } from "../client-hud-v2/client-hud-v2-chronicle.js";
import { activityCardCoordinates, activityCardText } from "./client-activity-dashboard-format.js";
import { activityCardTone } from "./client-activity-dashboard-tone.js";

const card = (overrides: Partial<PersonalActivitySupplyEndedCard> = {}): PersonalActivitySupplyEndedCard => ({
  kind: "SUPPLY_ENDED", id: "supply-ended:deal:me", occurredAt: 1_000, counterpartyPlayerId: "hugo",
  reason: "CANCELLED", byPlayerId: "hugo", youGave: {}, youGot: { FOOD: 2 }, ...overrides
});
const names = (id: string): string | undefined => (id === "hugo" ? "Hugo" : undefined);

describe("supply deal ended rows", () => {
  it("says what stopped, from whom, and why", () => {
    expect(activityCardText(card(), "me", names)).toBe("Hugo's supply of 2 food to you stopped · Hugo ended it");
    expect(activityCardText(card({ byPlayerId: "me" }), "me", names)).toBe("Hugo's supply of 2 food to you stopped · you ended it");
    expect(activityCardText(card({ reason: "EXPIRED", youGot: {}, youGave: { FOOD: 3 } }), "me", names)).toBe("Your supply of 3 food to Hugo stopped · its time ran out");
    expect(activityCardText(card({ reason: "ATTACK", byPlayerId: "hugo" }), "me", names)).toBe("Hugo's supply of 2 food to you stopped · Hugo attacked you");
  });

  it("is a loss when someone else cut off an import, has no map location, and filters by its empire", () => {
    expect(activityCardTone(card(), "me")).toBe("loss");
    expect(activityCardTone(card({ byPlayerId: "me" }), "me")).toBe("neutral");
    expect(activityCardCoordinates(card())).toBeUndefined();
    expect(cardCounterparties(card(), "me")).toEqual(["hugo"]);
  });
});
