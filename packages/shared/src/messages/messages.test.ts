import { describe, expect, it } from "vitest";

import { ClientMessageSchema } from "./messages.js";

describe("ClientMessageSchema", () => {
  it("accepts attack preview request ids", () => {
    expect(ClientMessageSchema.parse({ type: "ATTACK_PREVIEW", fromX: 1, fromY: 2, toX: 3, toY: 4, requestId: "preview-1" })).toEqual({
      type: "ATTACK_PREVIEW",
      fromX: 1,
      fromY: 2,
      toX: 3,
      toY: 4,
      requestId: "preview-1"
    });
  });

  it("accepts upgrade-town-tier messages", () => {
    expect(ClientMessageSchema.parse({ type: "UPGRADE_TOWN_TIER", x: 4, y: 9 })).toEqual({
      type: "UPGRADE_TOWN_TIER",
      x: 4,
      y: 9
    });
  });

  it("accepts reveal-map snapshot requests", () => {
    expect(ClientMessageSchema.parse({ type: "REQUEST_REVEAL_MAP" })).toEqual({
      type: "REQUEST_REVEAL_MAP"
    });
  });

  it("accepts alliance and truce dismiss/cancel messages", () => {
    expect(ClientMessageSchema.parse({ type: "ALLIANCE_REJECT", requestId: "alliance-1" })).toEqual({
      type: "ALLIANCE_REJECT",
      requestId: "alliance-1"
    });
    expect(ClientMessageSchema.parse({ type: "ALLIANCE_CANCEL", requestId: "alliance-2" })).toEqual({
      type: "ALLIANCE_CANCEL",
      requestId: "alliance-2"
    });
    expect(ClientMessageSchema.parse({ type: "TRUCE_REJECT", requestId: "truce-1" })).toEqual({
      type: "TRUCE_REJECT",
      requestId: "truce-1"
    });
    expect(ClientMessageSchema.parse({ type: "TRUCE_CANCEL", requestId: "truce-2" })).toEqual({
      type: "TRUCE_CANCEL",
      requestId: "truce-2"
    });
  });

  it("preserves chosenTrickleResource on CHOOSE_DOMAIN messages", () => {
    // Regression: prior to declaring chosenTrickleResource on the schema, Zod
    // silently stripped the field, the gateway forwarded an empty payload and
    // the sim rejected with `resource choice required` even when the
    // client had picked a valid resource.
    expect(
      ClientMessageSchema.parse({ type: "CHOOSE_DOMAIN", domainId: "clockwork-stipend", chosenTrickleResource: "UMBRITE" })
    ).toEqual({
      type: "CHOOSE_DOMAIN",
      domainId: "clockwork-stipend",
      chosenTrickleResource: "UMBRITE"
    });
  });

  it("rejects unknown resource keys on CHOOSE_DOMAIN", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "CHOOSE_DOMAIN", domainId: "clockwork-stipend", chosenTrickleResource: "PLUTONIUM" })
    ).toThrow();
  });

  it("accepts BUILD_ECONOMIC_STRUCTURE for both Weapons Factories", () => {
    // Regression: the two Weapons Factories were never added to this
    // message's structureType enum, so once the client-side dispatch bug
    // (client-tile-action-support.ts) was fixed and the client actually sent
    // the BUILD_ECONOMIC_STRUCTURE message, the gateway rejected it with
    // BAD_MSG ("invalid_enum_value") instead of the intended structure ever
    // reaching runtime-structure-command-handlers.ts (which already handles
    // both types).
    expect(
      ClientMessageSchema.parse({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "TITANIUM_WEAPONS_FACTORY" })
    ).toEqual({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "TITANIUM_WEAPONS_FACTORY" });
    expect(
      ClientMessageSchema.parse({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "UMBRITE_WEAPONS_FACTORY" })
    ).toEqual({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "UMBRITE_WEAPONS_FACTORY" });
  });

  it("accepts SET_MUSTER with mode MARCH and a target tile", () => {
    // Regression: the client's "March To…" muster action
    // (client-muster-march-targeting.ts) sends SET_MUSTER with mode: "MARCH",
    // but this schema's mode enum only listed HOLD/ADVANCE, so the gateway's
    // ClientMessageSchema.safeParse rejected every march command with
    // BAD_MSG before it ever reached the sim — the flag never connected.
    expect(
      ClientMessageSchema.parse({ type: "SET_MUSTER", x: 10, y: 10, mode: "MARCH", targetX: 12, targetY: 14 })
    ).toEqual({ type: "SET_MUSTER", x: 10, y: 10, mode: "MARCH", targetX: 12, targetY: 14 });
  });
});
