import { applyRelicAndProgressionUpdate, type RelicHintClientState } from "../client-relic-overlay/relic-map-hints.js";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ClientState } from "../client-state/client-state.js";
import { ABILITY_RESULT_MESSAGE_TYPES, applyAbilityResultMessage } from "../client-ability-result-messages/client-ability-result-messages.js";

// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Source-string
// assertions rather than a full WS-message integration test — client-network.ts
// is already over the file-line cap (frozen), so this locks in the wiring
// cheaply without adding to that file's test surface.
describe("client network Imperial Ward message regression", () => {
  it("routes IMPERIAL_WARD_ACTIVATED through the ability-result router", () => {
    const networkSource = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");

    expect(networkSource).toContain(
      'import { ABILITY_RESULT_MESSAGE_TYPES, applyAbilityResultMessage } from "../client-ability-result-messages/client-ability-result-messages.js";'
    );
    expect(networkSource).toContain("ABILITY_RESULT_MESSAGE_TYPES.has(msg.type)");
    expect(networkSource).toContain("applyAbilityResultMessage(state, msg);");
  });

  it("applies IMPERIAL_WARD_ACTIVATED to state via the router", () => {
    const state = {} as ClientState;
    expect(ABILITY_RESULT_MESSAGE_TYPES.has("IMPERIAL_WARD_ACTIVATED")).toBe(true);
    applyAbilityResultMessage(state, { type: "IMPERIAL_WARD_ACTIVATED", activeUntil: 123, chargesRemaining: 1 });
    expect(state.imperialWardActiveUntil).toBe(123);
    expect(state.imperialWardCharges).toBe(1);
  });

  it("syncs imperialWardCharges from both INIT and PLAYER_UPDATE player payloads", () => {
    // The INIT-side assignment was extracted out of client-network.ts (over
    // the file-line cap, frozen) into client-network-init-message.ts.
    const initSource = readFileSync(new URL("../client-network-init-message/client-network-init-message.ts", import.meta.url), "utf8");
    const networkSource = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");

    expect(initSource).toContain("state.imperialWardCharges = (player as { imperialWardCharges?: number }).imperialWardCharges;");
    expect(networkSource).toContain("applyRelicAndProgressionUpdate(state, msg);");
    const state: RelicHintClientState = { relicMapHints: new Map(), tilesRevision: 0, relicMapHintsRevision: 0, chosenTrickleResource: undefined, imperialWardCharges: undefined, wonderLastFreeRushBuyAt: undefined };
    applyRelicAndProgressionUpdate(state, { imperialWardCharges: 3 });
    expect(state.imperialWardCharges).toBe(3);
    applyRelicAndProgressionUpdate(state, { imperialWardCharges: "invalid" });
    expect(state.imperialWardCharges).toBe(3);
  });
});
