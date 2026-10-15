import { describe, expect, it } from "vitest";

import { createSocialState, type SocialStateSink } from "./social-state.js";
import {
  createSocialOfferCooldowns,
  MAX_OFFER_COOLDOWNS,
  OFFER_EXPIRED_COOLDOWN_MS,
  OFFER_REJECTED_COOLDOWN_MS,
  type SocialOfferCooldown
} from "./social-offer-cooldowns.js";

const players = [
  { id: "player-1", name: "Nauticus" },
  { id: "player-2", name: "Valka" },
  { id: "player-3", name: "Orrin" }
];

const setup = (initialCooldowns: SocialOfferCooldown[] = []) => {
  const clock = { now: 1_000 };
  const saved: SocialOfferCooldown[] = [];
  const sink = new Proxy({} as SocialStateSink, {
    get: (_target, property) => (property === "saveOfferCooldown" ? (entry: SocialOfferCooldown) => saved.push(entry) : () => undefined)
  });
  const social = createSocialState({ now: () => clock.now, players, sink, initial: { offerCooldowns: initialCooldowns } });
  return { social, clock, saved };
};

const incomingTruceId = (social: ReturnType<typeof createSocialState>, playerId: string): string =>
  social.snapshotForPlayer(playerId).incomingTruceRequests[0]!.id;
const incomingAllianceId = (social: ReturnType<typeof createSocialState>, playerId: string): string =>
  social.snapshotForPlayer(playerId).incomingAllianceRequests[0]!.id;

describe("truce/alliance re-offer cooldowns", () => {
  it("blocks re-offering a rejected truce to the same player for 30 minutes", () => {
    const { social, clock } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.rejectTruce("player-2", incomingTruceId(social, "player-2")).ok).toBe(true);

    expect(social.requestTruce("player-1", "Valka", 12)).toEqual({
      ok: false,
      code: "TRUCE_OFFER_COOLDOWN",
      message: "You can offer Valka a truce again in 30m."
    });

    clock.now += OFFER_REJECTED_COOLDOWN_MS;
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
  });

  it("counts a cancel too, so cancel-and-resend can't dodge the cooldown", () => {
    const { social } = setup();
    social.requestTruce("player-1", "Valka", 12);
    const requestId = social.snapshotForPlayer("player-1").outgoingTruceRequests[0]!.id;
    expect(social.cancelTruce("player-1", requestId).ok).toBe(true);

    expect(social.requestTruce("player-1", "Valka", 12)).toEqual(expect.objectContaining({ ok: false, code: "TRUCE_OFFER_COOLDOWN" }));
  });

  it("applies the shorter cooldown when a truce offer expires unanswered", () => {
    const { social, clock } = setup();
    const request = social.requestTruce("player-1", "Valka", 12);
    expect(request.ok).toBe(true);
    const expiresAt = social.snapshotForPlayer("player-1").outgoingTruceRequests[0]!.expiresAt;

    clock.now = expiresAt;
    expect(social.requestTruce("player-1", "Valka", 12)).toEqual(
      expect.objectContaining({ ok: false, code: "TRUCE_OFFER_COOLDOWN", message: "You can offer Valka a truce again in 10m." })
    );
    clock.now = expiresAt + OFFER_EXPIRED_COOLDOWN_MS;
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
  });

  it("is directional and per kind: the target can still offer back, others are unaffected, and alliances are separate", () => {
    const { social } = setup();
    social.requestTruce("player-1", "Valka", 12);
    social.rejectTruce("player-2", incomingTruceId(social, "player-2"));

    expect(social.requestTruce("player-2", "Nauticus", 12).ok).toBe(true);
    expect(social.requestTruce("player-1", "Orrin", 12).ok).toBe(true);
    expect(social.requestAlliance("player-1", "Valka").ok).toBe(true);
  });

  it("blocks re-offering a rejected or cancelled alliance", () => {
    const { social } = setup();
    social.requestAlliance("player-1", "Valka");
    social.rejectAlliance("player-2", incomingAllianceId(social, "player-2"));
    expect(social.requestAlliance("player-1", "Valka")).toEqual(
      expect.objectContaining({ ok: false, code: "ALLIANCE_OFFER_COOLDOWN", message: "You can offer Valka an alliance again in 30m." })
    );

    social.requestAlliance("player-1", "Orrin");
    const outgoing = social.snapshotForPlayer("player-1").outgoingAllianceRequests[0]!.id;
    social.cancelAlliance("player-1", outgoing);
    expect(social.requestAlliance("player-1", "Orrin")).toEqual(expect.objectContaining({ code: "ALLIANCE_OFFER_COOLDOWN" }));
  });

  it("skips the cooldown when the decline asks it to (e.g. an AI that couldn't be evaluated)", () => {
    const { social } = setup();
    social.requestTruce("player-1", "Valka", 12);
    social.rejectTruce("player-2", incomingTruceId(social, "player-2"), { startCooldown: false });
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
  });

  it("does not start a cooldown when an offer is accepted", () => {
    const { social, clock } = setup();
    social.requestTruce("player-1", "Valka", 12);
    social.acceptTruce("player-2", incomingTruceId(social, "player-2"));
    clock.now += 12 * 60 * 60_000;
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
  });

  it("persists cooldowns through the sink, survives a restart, and shows them on the sender's snapshot", () => {
    const first = setup();
    first.social.requestTruce("player-1", "Valka", 12);
    first.social.rejectTruce("player-2", incomingTruceId(first.social, "player-2"));
    expect(first.saved).toEqual([{ kind: "truce", fromPlayerId: "player-1", toPlayerId: "player-2", until: 1_000 + OFFER_REJECTED_COOLDOWN_MS }]);

    const restarted = setup(first.saved);
    expect(restarted.social.requestTruce("player-1", "Valka", 12)).toEqual(expect.objectContaining({ code: "TRUCE_OFFER_COOLDOWN" }));
    expect(restarted.social.snapshotForPlayer("player-1").offerCooldowns).toEqual([
      { kind: "truce", targetPlayerId: "player-2", until: 1_000 + OFFER_REJECTED_COOLDOWN_MS }
    ]);
    expect(restarted.social.snapshotForPlayer("player-2").offerCooldowns).toEqual([]);
  });
});

describe("createSocialOfferCooldowns", () => {
  it("drops expired entries on sweep and when loading initial state", () => {
    let now = 0;
    const cooldowns = createSocialOfferCooldowns(() => now, [{ kind: "truce", fromPlayerId: "a", toPlayerId: "b", until: -1 }]);
    expect(cooldowns.size()).toBe(0);
    cooldowns.start("truce", "a", "b", 100);
    now = 100;
    expect(cooldowns.sweep()).toBe(true);
    expect(cooldowns.size()).toBe(0);
  });

  it("stays bounded by evicting the soonest-to-expire entry", () => {
    const cooldowns = createSocialOfferCooldowns(() => 0);
    for (let index = 0; index < MAX_OFFER_COOLDOWNS; index += 1) cooldowns.start("truce", `p${index}`, "target", 1_000 + index);
    cooldowns.start("alliance", "late", "target", 5_000);
    expect(cooldowns.size()).toBe(MAX_OFFER_COOLDOWNS);
    expect(cooldowns.remainingMs("truce", "p0", "target")).toBe(0);
    expect(cooldowns.remainingMs("alliance", "late", "target")).toBe(5_000);
  });
});
