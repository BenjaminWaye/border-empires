import { describe, expect, it, vi } from "vitest";

import { offerDiplomacyGift, type DiplomacyGiftDeps } from "./diplomacy-gift-message.js";

const players = new Map([
  ["ai-1", { id: "ai-1", name: "Elin" }],
  ["human-2", { id: "human-2", name: "Ada" }]
]);

const makeDeps = (overrides: Partial<DiplomacyGiftDeps> = {}): DiplomacyGiftDeps => ({
  resolvePlayerByName: (name) => [...players.values()].find((player) => player.name === name),
  resolvePlayerById: (id) => players.get(id),
  isAi: (id) => id === "ai-1",
  settle: vi.fn(async () => ({ ok: true as const })),
  recordPayment: vi.fn(),
  recordGatewayEvent: vi.fn(),
  ...overrides
});

const gift = (gold: number, shard = 0) => ({ targetPlayerName: "Elin", targetPlayerId: "ai-1", gift: { gold, shard } });

describe("offerDiplomacyGift", () => {
  it("pays the AI and remembers the gift as goodwill", async () => {
    const deps = makeDeps();
    const result = await offerDiplomacyGift(deps, "me", gift(40, 2), { isGuest: false });
    expect(deps.settle).toHaveBeenCalledWith({ proposerId: "me", targetId: "ai-1", terms: { give: { gold: 40, shard: 2 }, ask: { gold: 0, shard: 0 } } });
    expect(deps.recordPayment).toHaveBeenCalledWith("ai-1", "me", 90);
    expect(result).toMatchObject({ type: "DIPLOMACY_GIFT_RESULT", ok: true, targetPlayerId: "ai-1", message: "You gave Elin 40 coin and 2 Shards as a gift." });
  });

  it("records no goodwill when the payment fails", async () => {
    const deps = makeDeps({ settle: vi.fn(async () => ({ ok: false as const, message: "The deal fell through: me no longer has 40 coin." })) });
    const result = await offerDiplomacyGift(deps, "me", gift(40), { isGuest: false });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("no longer has 40 coin");
    expect(deps.recordPayment).not.toHaveBeenCalled();
  });

  it("refuses guests, human targets, yourself and empty gifts without paying", async () => {
    const deps = makeDeps();
    expect((await offerDiplomacyGift(deps, "me", gift(40), { isGuest: true })).ok).toBe(false);
    expect((await offerDiplomacyGift(deps, "me", { targetPlayerName: "Ada", gift: { gold: 40, shard: 0 } }, { isGuest: false })).message).toBe(
      "Ada keeps no opinion of you to win over. Only AI empires take gifts."
    );
    expect((await offerDiplomacyGift(deps, "ai-1", gift(40), { isGuest: false })).ok).toBe(false);
    expect((await offerDiplomacyGift(deps, "me", gift(0), { isGuest: false })).ok).toBe(false);
    expect(deps.settle).not.toHaveBeenCalled();
  });
});
