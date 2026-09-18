import { describe, expect, it, vi } from "vitest";

import type { StoredAuthIdentityBinding } from "../auth-binding-store/auth-binding-store.js";
import { notifySeasonStarted } from "./season-start-notify.js";

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const bindingFor = (playerId: string): StoredAuthIdentityBinding => ({
  uid: `uid-${playerId}`,
  playerId,
  email: `${playerId}@example.com`,
  updatedAt: 0
});

describe("notifySeasonStarted", () => {
  it("throttles recipient sends to 5/sec instead of firing every recipient in the same tick", async () => {
    vi.useFakeTimers();
    try {
      const bindings = Array.from({ length: 12 }, (_, i) => bindingFor(`player-${i}`));
      const sendCallTimestamps: number[] = [];

      notifySeasonStarted({
        listSeasonArchives: async () => [],
        listPlayersWithEmail: async () => bindings,
        sendSeasonStartAlert: async () => {
          sendCallTimestamps.push(Date.now());
          return "sent";
        },
        sendGameplayEmailAlert: (_kind, _recipientPlayerId, send) => {
          void send();
        },
        onError: () => {}
      });

      // Let the archive/binding lookups resolve so the send loop starts.
      await flushMicrotasks();

      // Immediately after starting, more than 5 sends must NOT have fired --
      // the pre-fix code fired all 12 in the same tick, which is exactly what
      // blew past Resend's 10 req/sec limit and got some recipients dropped.
      expect(sendCallTimestamps.length).toBeLessThanOrEqual(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(sendCallTimestamps.length).toBeLessThanOrEqual(6);

      await vi.advanceTimersByTimeAsync(3_000);
      expect(sendCallTimestamps).toHaveLength(12);
    } finally {
      vi.useRealTimers();
    }
  });
});
