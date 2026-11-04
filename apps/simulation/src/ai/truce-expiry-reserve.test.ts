// The AI banks manpower ahead of a truce running out, so the partner can't
// log in at expiry and take an empty border.
import { describe, expect, it } from "vitest";
import { aiWarReserveManpower, EXPAND_MANPOWER_COST } from "@border-empires/shared";

import { planAutomationCommand } from "./automation-command-planner.js";
import {
  spendableManpowerForPlanner,
  TRUCE_EXPIRY_PREP_MS,
  TRUCE_EXPIRY_RESERVE_CAP_FRACTION,
  truceExpiringSoon
} from "./automation-command-planner-war-reserve.js";

const NOW = 10_000_000;
const CAP = 1000;
const base = { sessionPrefix: "ai-runtime", manpowerCapacity: CAP, manpower: 700, issuedAt: NOW };

describe("truce-expiry manpower reserve", () => {
  it("only counts a truce ending inside the prep window", () => {
    expect(truceExpiringSoon({ issuedAt: NOW, soonestTruceEndsAt: NOW + TRUCE_EXPIRY_PREP_MS })).toBe(true);
    expect(truceExpiringSoon({ issuedAt: NOW, soonestTruceEndsAt: NOW + TRUCE_EXPIRY_PREP_MS + 1 })).toBe(false);
    expect(truceExpiringSoon({ issuedAt: NOW, soonestTruceEndsAt: NOW - 1 })).toBe(false);
    expect(truceExpiringSoon({ issuedAt: NOW })).toBe(false);
  });

  it("raises the reserve to a share of cap while a truce is about to end", () => {
    expect(spendableManpowerForPlanner(base)).toBe(700 - aiWarReserveManpower(CAP));
    expect(spendableManpowerForPlanner({ ...base, soonestTruceEndsAt: NOW + 30 * 60_000 })).toBe(700 - CAP * TRUCE_EXPIRY_RESERVE_CAP_FRACTION);
    // Manpower already staged in muster flags counts toward it.
    expect(spendableManpowerForPlanner({ ...base, soonestTruceEndsAt: NOW + 30 * 60_000, musterStagedManpower: 600 })).toBe(700);
  });

  it("stops expanding into the reserve shortly before a truce expires", () => {
    const owned = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "FRONTIER" };
    const target = { x: 11, y: 10, terrain: "LAND" as const, resource: "FARM" };
    const plan = (soonestTruceEndsAt?: number) =>
      planAutomationCommand({
        playerId: "ai-1",
        points: 500,
        manpower: EXPAND_MANPOWER_COST + 300,
        manpowerCapacity: CAP,
        hasActiveLock: false,
        activeDevelopmentProcessCount: 0,
        frontierTiles: [owned],
        ownedTiles: [owned],
        tilesByKey: new Map([["10,10", owned], ["11,10", target]]),
        clientSeq: 2,
        issuedAt: NOW,
        sessionPrefix: "ai-runtime",
        ...(soonestTruceEndsAt !== undefined ? { soonestTruceEndsAt } : {})
      });
    expect(plan().command?.type).toBe("EXPAND");
    expect(plan(NOW + 30 * 60_000).command?.type).not.toBe("EXPAND");
    expect(plan(NOW + 10 * 60 * 60_000).command?.type).toBe("EXPAND");
  });
});
