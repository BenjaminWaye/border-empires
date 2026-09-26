import { describe, expect, it } from "vitest";

import {
  PERSONAL_IMPACT_LOG_MAX_ENTRIES,
  PERSONAL_IMPACT_WINDOW_MS,
  createPersonalImpactLog,
  type PersonalImpactEvent
} from "./personal-impact-log.js";

const event = (occurredAt: number, id: string = `impact:${occurredAt}`): PersonalImpactEvent => ({
  id,
  kind: "BUILDING_COMPLETED",
  playerId: "player-1",
  occurredAt,
  x: 4,
  y: 8,
  structureType: "GRANARY",
  populationBurst: 10_000
});

describe("personal impact log", () => {
  it("drops events outside its 24-hour window before recording a new event", () => {
    const now = 2 * PERSONAL_IMPACT_WINDOW_MS;
    const log = createPersonalImpactLog({ now: () => now });
    log.record(event(now - PERSONAL_IMPACT_WINDOW_MS - 1, "old"));
    log.record(event(now, "new"));

    expect(log.entries().map((entry) => entry.id)).toEqual(["new"]);
  });

  it("caps independently of its time window and exposes cap hits", () => {
    const now = PERSONAL_IMPACT_WINDOW_MS;
    const log = createPersonalImpactLog({ now: () => now });
    for (let index = 0; index <= PERSONAL_IMPACT_LOG_MAX_ENTRIES; index += 1) {
      log.record(event(now, `event:${index}`));
    }

    expect(log.entries()).toHaveLength(PERSONAL_IMPACT_LOG_MAX_ENTRIES);
    expect(log.entries()[0]?.id).toBe("event:1");
    expect(log.gauge().capHits).toBe(1);
  });

  it("restores only the current window in chronological order", () => {
    const now = 2 * PERSONAL_IMPACT_WINDOW_MS;
    const log = createPersonalImpactLog({ now: () => now });
    log.restore([
      event(now - PERSONAL_IMPACT_WINDOW_MS - 1, "old"),
      event(now - 1, "late"),
      event(now - 10, "early")
    ], now);

    expect(log.entries().map((entry) => entry.id)).toEqual(["early", "late"]);
  });
});
