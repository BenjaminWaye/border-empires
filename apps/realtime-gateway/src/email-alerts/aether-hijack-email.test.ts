import { describe, expect, it } from "vitest";
import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { createEmailAlertService, readAetherHijackAlert } from "./email-alerts.js";

describe("Resonance Hijack email alert", () => {
  it("emails the defender at once, pointing at the casting tower, even right after an attack email", async () => {
    const now = Date.UTC(2026, 10, 2, 12);
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => now);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    const sent: Array<{ subject: string; text: string }> = [];
    const alerts = createEmailAlertService({ authBindingStore, transport: { send: async (message) => { sent.push(message); } }, appUrl: "https://play.example", now: () => now });
    await alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Milo Ash", x: 1, y: 2 });
    await expect(alerts.sendAetherHijackAlert({ defenderPlayerId: "player-1", attackerName: "Milo Ash", x: 40, y: 41, casterX: 30, casterY: 31, endsAt: now + 10 * 60_000 })).resolves.toBe("sent");
    expect(sent.at(-1)).toEqual(expect.objectContaining({
      subject: "Milo Ash is hijacking your Aether Tower",
      text: expect.stringContaining("Defend Now: https://play.example/?x=30&y=31")
    }));
    expect(sent.at(-1)?.text).toContain("12:10 UTC");
  });

  it("reads only complete AETHER_HIJACK_ALERT payloads", () => {
    const payload = { type: "AETHER_HIJACK_ALERT", attackerName: "IronFist", x: 3, y: 4, casterX: 1, casterY: 2, endsAt: 99 };
    expect(readAetherHijackAlert(payload)).toEqual({ attackerName: "IronFist", x: 3, y: 4, casterX: 1, casterY: 2, endsAt: 99 });
    expect(readAetherHijackAlert({ ...payload, casterX: undefined })).toBeUndefined();
    expect(readAetherHijackAlert({ ...payload, type: "AETHER_PURGE_ALERT" })).toBeUndefined();
  });
});
