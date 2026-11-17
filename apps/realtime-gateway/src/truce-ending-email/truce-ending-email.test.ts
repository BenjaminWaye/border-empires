import { describe, expect, it, vi } from "vitest";

import {
  createTruceEndingEmailNotifier,
  TRUCE_ENDING_EMAIL_BOOT_GRACE_MS,
  TRUCE_ENDING_EMAIL_WINDOW_MS,
  truceEndingEmailDue,
  type TruceEndingCandidate
} from "./truce-ending-email.js";

const HOUR = 60 * 60_000;
const MIN = 60_000;
const T0 = 1_800_000_000_000;

const setup = (initial: TruceEndingCandidate[]) => {
  let truces = initial;
  const sent: Array<{ recipientPlayerId: string; otherPartyName: string; endsAt: number }> = [];
  const onBootSkipped = vi.fn();
  const notifier = createTruceEndingEmailNotifier({
    activeTruces: () => truces,
    nameOf: (id) => ({ alice: "Alice", bob: "Bob", "ai-1": "Vorn" })[id] ?? id,
    isAiPlayer: (id) => id.startsWith("ai-"),
    sendTruceEndingAlert: async (input) => {
      sent.push(input);
      return "sent";
    },
    sendGameplayEmailAlert: (_kind, _recipient, send) => void send(),
    onBootSkipped
  });
  return { notifier, sent, onBootSkipped, setTruces: (next: TruceEndingCandidate[]) => { truces = next; } };
};

const truce = (endsAt: number, startedAt = endsAt - 12 * HOUR, a = "alice", b = "bob"): TruceEndingCandidate => ({ playerAId: a, playerBId: b, startedAt, endsAt });

describe("truceEndingEmailDue", () => {
  it("is due only inside the last hour of a running truce", () => {
    expect(truceEndingEmailDue(truce(T0 + 2 * HOUR), T0)).toBe(false);
    expect(truceEndingEmailDue(truce(T0 + HOUR), T0)).toBe(true);
    expect(truceEndingEmailDue(truce(T0 + 5 * MIN), T0)).toBe(true);
  });

  it("is never due for an already-expired truce", () => {
    expect(truceEndingEmailDue(truce(T0), T0)).toBe(false);
    expect(truceEndingEmailDue(truce(T0 - MIN), T0)).toBe(false);
  });

  it("is never due for a truce no longer than the window", () => {
    expect(truceEndingEmailDue(truce(T0 + 30 * MIN, T0 - 10 * MIN), T0)).toBe(false);
    expect(truceEndingEmailDue(truce(T0 + 30 * MIN, T0 + 30 * MIN - TRUCE_ENDING_EMAIL_WINDOW_MS), T0)).toBe(false);
  });
});

describe("createTruceEndingEmailNotifier", () => {
  it("emails each human party once when the truce enters its last hour", () => {
    const endsAt = T0 + 3 * HOUR;
    const { notifier, sent } = setup([truce(endsAt)]);
    notifier.tick(T0);
    expect(sent).toHaveLength(0);
    notifier.tick(endsAt - 59 * MIN);
    expect(sent).toEqual([
      { recipientPlayerId: "alice", otherPartyName: "Bob", endsAt },
      { recipientPlayerId: "bob", otherPartyName: "Alice", endsAt }
    ]);
    notifier.tick(endsAt - 30 * MIN);
    notifier.tick(endsAt - MIN);
    expect(sent).toHaveLength(2);
  });

  it("fires again for the new end after an extension", () => {
    const endsAt = T0 + 3 * HOUR;
    const { notifier, sent, setTruces } = setup([truce(endsAt)]);
    notifier.tick(T0);
    notifier.tick(endsAt - 50 * MIN);
    expect(sent).toHaveLength(2);
    const extendedEndsAt = endsAt + 12 * HOUR;
    setTruces([truce(extendedEndsAt, endsAt - 12 * HOUR)]);
    notifier.tick(endsAt - 40 * MIN);
    expect(sent).toHaveLength(2);
    notifier.tick(extendedEndsAt - 55 * MIN);
    expect(sent).toHaveLength(4);
    expect(sent[3]?.endsAt).toBe(extendedEndsAt);
  });

  it("never emails for an expired truce, and forgets pairs whose truce is gone", () => {
    const { notifier, sent, setTruces } = setup([truce(T0 - MIN)]);
    notifier.tick(T0);
    expect(sent).toHaveLength(0);
    setTruces([truce(T0 + 30 * MIN)]);
    notifier.tick(T0 + MIN);
    // Past the boot tick, a truce first seen with 30m left still warns.
    expect(sent).toHaveLength(2);
    expect(notifier.size()).toBe(1);
    setTruces([]);
    notifier.tick(T0 + 2 * MIN);
    expect(notifier.size()).toBe(0);
  });

  it("skips AI recipients", () => {
    const endsAt = T0 + 2 * HOUR;
    const { notifier, sent } = setup([truce(endsAt, endsAt - 24 * HOUR, "ai-1", "alice")]);
    notifier.tick(T0);
    notifier.tick(endsAt - 45 * MIN);
    expect(sent).toEqual([{ recipientPlayerId: "alice", otherPartyName: "Vorn", endsAt }]);
  });

  it("after a restart, skips truces the previous process already warned but sends ones that just entered the window", () => {
    const longWarned = truce(T0 + 20 * MIN);
    const justEntered = truce(T0 + TRUCE_ENDING_EMAIL_WINDOW_MS - TRUCE_ENDING_EMAIL_BOOT_GRACE_MS + MIN, undefined, "carol", "dave");
    const { notifier, sent, onBootSkipped } = setup([longWarned, justEntered]);
    notifier.tick(T0);
    expect(sent.map((input) => input.recipientPlayerId)).toEqual(["carol", "dave"]);
    expect(onBootSkipped).toHaveBeenCalledWith(1);
    notifier.tick(T0 + MIN);
    expect(sent).toHaveLength(2);
  });
});
