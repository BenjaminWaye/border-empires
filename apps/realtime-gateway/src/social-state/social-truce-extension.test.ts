import { describe, expect, it } from "vitest";

import { createSocialState, type SocialActiveTruce, type SocialStateSink } from "./social-state.js";

const HOUR = 3_600_000;
const players = [
  { id: "player-1", name: "Nauticus" },
  { id: "player-2", name: "Valka" }
];

const setup = () => {
  const clock = { now: 1_000_000 };
  const savedTruces: SocialActiveTruce[] = [];
  const sink = new Proxy({} as SocialStateSink, {
    get: (_target, property) => (property === "saveActiveTruce" ? (truce: SocialActiveTruce) => savedTruces.push({ ...truce }) : () => undefined)
  });
  const social = createSocialState({ now: () => clock.now, players, sink });
  const incomingId = (playerId: string): string => social.snapshotForPlayer(playerId).incomingTruceRequests[0]!.id;
  const truceEndsAt = (): number | undefined => social.snapshotForPlayer("player-1").activeTruces[0]?.endsAt;
  const agree = (hours: 12 | 24): void => {
    expect(social.requestTruce("player-1", "Valka", hours).ok).toBe(true);
    expect(social.acceptTruce("player-2", incomingId("player-2")).ok).toBe(true);
  };
  return { social, clock, savedTruces, incomingId, truceEndsAt, agree };
};

describe("extending a running truce", () => {
  // Regression: a truce offer during a truce used to be refused with TRUCE_EXISTS.
  it("adds the offered hours to the current end on accept and persists it", () => {
    const { social, clock, savedTruces, incomingId, truceEndsAt, agree } = setup();
    agree(12);
    const startedAt = clock.now;
    clock.now += 4 * HOUR;

    expect(social.requestTruce("player-2", "Nauticus", 24).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").incomingTruceRequests[0]).toMatchObject({ extendsTruce: true, durationHours: 24 });
    const accepted = social.acceptTruce("player-1", incomingId("player-1"));

    expect(accepted.ok).toBe(true);
    expect(truceEndsAt()).toBe(startedAt + 36 * HOUR);
    expect(savedTruces.at(-1)).toMatchObject({ startedAt, endsAt: startedAt + 36 * HOUR, createdByPlayerId: "player-1" });
    expect(social.snapshotForPlayer("player-1").activeTruces).toHaveLength(1);
  });

  it("refuses an extension that would run the truce more than 48h ahead", () => {
    const { social, clock, truceEndsAt, agree } = setup();
    agree(24);
    agree(24);
    expect(truceEndsAt()).toBe(clock.now + 48 * HOUR);
    expect(social.requestTruce("player-1", "Valka", 12)).toEqual({
      ok: false,
      code: "TRUCE_EXTENSION_CAP",
      message: "a truce can run at most 48h ahead"
    });
    clock.now += 12 * HOUR;
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
  });

  it("keeps one pending offer per pair and the re-offer cooldown after a rejected extension", () => {
    const { social, incomingId, agree } = setup();
    agree(12);
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.requestTruce("player-2", "Nauticus", 12)).toMatchObject({ ok: false, code: "TRUCE_REQUEST_PENDING" });
    expect(social.rejectTruce("player-2", incomingId("player-2")).ok).toBe(true);
    expect(social.requestTruce("player-1", "Valka", 12)).toMatchObject({ ok: false, code: "TRUCE_OFFER_COOLDOWN" });
  });

  it("starts a fresh truce when an extension is accepted after the old truce ran out", () => {
    const { social, clock, incomingId, truceEndsAt, agree } = setup();
    agree(12);
    clock.now += 12 * HOUR - 60_000;
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    clock.now += 2 * 60_000;
    expect(social.acceptTruce("player-2", incomingId("player-2")).ok).toBe(true);
    expect(truceEndsAt()).toBe(clock.now + 12 * HOUR);
  });

  it("refuses extensions from a player locked out for breaking a truce", () => {
    const { social, agree } = setup();
    agree(12);
    expect(social.breakTruce("player-1", "player-2").ok).toBe(true);
    expect(social.requestTruce("player-1", "Valka", 12)).toMatchObject({ ok: false, code: "TRUCE_LOCKED_OUT" });
  });
});
