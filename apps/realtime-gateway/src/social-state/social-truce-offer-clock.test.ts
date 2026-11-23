// Regression: a 24h truce offered in the evening and accepted at 8am ran until
// 8am the next day, because the clock started at acceptance. A new truce now
// runs from when it was offered, and its offer lapses when that window closes.
import { describe, expect, it } from "vitest";

import { truceRequestFromRow, type TruceRequestRow } from "../social-store/social-store-row-mappers.js";
import { createSocialState } from "./social-state.js";
import { offeredTruceHoursLeft, truceOfferExpiresAt } from "./social-truce-extension.js";

const HOUR = 3_600_000;
const players = [
  { id: "player-1", name: "Nauticus" },
  { id: "player-2", name: "Valka" }
];

const setup = () => {
  const clock = { now: 1_000_000 };
  const social = createSocialState({ now: () => clock.now, players });
  const incoming = () => social.snapshotForPlayer("player-2").incomingTruceRequests[0];
  const truce = () => social.snapshotForPlayer("player-1").activeTruces[0];
  return { social, clock, incoming, truce };
};

describe("truce clock starts at the offer", () => {
  it("ends a truce accepted 16h late 24h after it was offered", () => {
    const { social, clock, incoming, truce } = setup();
    const sentAt = clock.now;
    expect(social.requestTruce("player-1", "Valka", 24).ok).toBe(true);
    clock.now += 16 * HOUR;
    const accepted = social.acceptTruce("player-2", incoming()!.id);
    expect(accepted.ok).toBe(true);
    expect(truce()).toMatchObject({ startedAt: sentAt, endsAt: sentAt + 24 * HOUR });
  });

  it("lapses an unanswered offer when its truce window has passed", () => {
    const { social, clock, incoming, truce } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const offer = incoming()!;
    expect(offer.expiresAt).toBe(offer.createdAt + 12 * HOUR);
    clock.now += 12 * HOUR + 1;
    expect(social.acceptTruce("player-2", offer.id)).toMatchObject({ ok: false, code: "TRUCE_REQUEST_INVALID" });
    expect(truce()).toBeUndefined();
    expect(incoming()).toBeUndefined();
  });

  it("refuses an offer whose truce window has passed even when its stored expiry has not", () => {
    const clock = { now: 30 * HOUR };
    const request = { id: "old", fromPlayerId: "player-1", toPlayerId: "player-2", durationHours: 12 as const, createdAt: 0, expiresAt: 40 * HOUR };
    const social = createSocialState({ now: () => clock.now, players, initial: { truceRequests: [request] } });
    expect(social.acceptTruce("player-2", "old")).toMatchObject({ ok: false, code: "TRUCE_REQUEST_INVALID" });
    expect(social.snapshotForPlayer("player-1").activeTruces).toEqual([]);
  });

  it("keeps extension offers on the long backstop: they add hours to the running end", () => {
    const { social, clock, incoming, truce } = setup();
    expect(social.requestTruce("player-1", "Valka", 24).ok).toBe(true);
    expect(social.acceptTruce("player-2", incoming()!.id).ok).toBe(true);
    const endsAt = truce()!.endsAt;
    clock.now += HOUR;
    expect(social.requestTruce("player-2", "Nauticus", 12).ok).toBe(true);
    const extension = social.snapshotForPlayer("player-1").incomingTruceRequests[0]!;
    expect(extension.expiresAt).toBeGreaterThan(endsAt);
    expect(social.acceptTruce("player-1", extension.id).ok).toBe(true);
    expect(truce()!.endsAt).toBe(endsAt + 12 * HOUR);
  });

  it("clamps offers saved with the old 7-day expiry to their truce window", () => {
    const row: TruceRequestRow = { id: "r", from_player_id: "player-1", to_player_id: "player-2", from_name: null, to_name: null, created_at: 0, expires_at: 7 * 24 * HOUR, duration_hours: 24, terms_json: null, extends_truce: 0 };
    const [request] = truceRequestFromRow(row);
    expect(request?.expiresAt).toBe(24 * HOUR);
    const [extension] = truceRequestFromRow({ ...row, extends_truce: 1 });
    expect(extension?.expiresAt).toBe(7 * 24 * HOUR);
  });

  it("measures the hours left on an offered truce", () => {
    expect(offeredTruceHoursLeft({ createdAt: 0, durationHours: 24 }, 16 * HOUR)).toBe(8);
    expect(offeredTruceHoursLeft({ createdAt: 0, durationHours: 12 }, 13 * HOUR)).toBe(0);
    expect(truceOfferExpiresAt({ createdAt: 0, durationHours: 12 }, 7 * 24 * HOUR)).toBe(12 * HOUR);
  });
});
