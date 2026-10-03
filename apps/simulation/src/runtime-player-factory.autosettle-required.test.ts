import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS, NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import type { DomainPlayer } from "@border-empires/game-domain";
import { createAiRuntimePlayer, createHumanRuntimePlayer } from "./runtime-player-factory.js";

describe("DomainPlayer.autoSettle is explicit", () => {
  it("humans start unanswered/off, AI starts on", () => {
    expect(createHumanRuntimePlayer("p1").autoSettle).toEqual(NEW_PLAYER_AUTO_SETTLE_PREFS);
    expect(createAiRuntimePlayer("ai-1").autoSettle).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
  });

  it("a player built without autoSettle does not compile (checked by `tsc` over test files; vitest alone does not typecheck)", () => {
    // @ts-expect-error autoSettle is required on DomainPlayer.
    const missing: DomainPlayer = { id: "p", isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
    expect(missing.id).toBe("p");
  });
});
