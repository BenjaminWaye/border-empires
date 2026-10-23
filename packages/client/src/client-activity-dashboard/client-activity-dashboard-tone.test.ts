import type { PersonalActivityCard } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { activityCardTone } from "./client-activity-dashboard-tone.js";

const tone = (card: Partial<PersonalActivityCard> & { kind: PersonalActivityCard["kind"] }): string => activityCardTone(card as PersonalActivityCard, "me");

describe("activityCardTone", () => {
  it("colours each row by how it went for the viewer", () => {
    expect(tone({ kind: "TERRITORY_FLIP_GROUP", direction: "GAINED" })).toBe("gain");
    expect(tone({ kind: "COMBAT", attackerId: "me", attackerWon: false })).toBe("loss");
    expect(tone({ kind: "COMBAT", attackerId: "hugo", attackerWon: false })).toBe("hold");
    expect(tone({ kind: "COMBAT_GROUP", role: "DEFENDER", captures: 1 })).toBe("loss");
    expect(tone({ kind: "COMBAT_GROUP", role: "ATTACKER", captures: 1 })).toBe("gain");
    expect(tone({ kind: "SIEGE", outcome: "HOLDING" })).toBe("hold");
    expect(tone({ kind: "BUILDING_COMPLETED" })).toBe("neutral");
  });
});
