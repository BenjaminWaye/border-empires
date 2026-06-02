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
    // the sim rejected with `trickle resource choice required` even when the
    // client had picked a valid resource.
    expect(
      ClientMessageSchema.parse({ type: "CHOOSE_DOMAIN", domainId: "clockwork-stipend", chosenTrickleResource: "SUPPLY" })
    ).toEqual({
      type: "CHOOSE_DOMAIN",
      domainId: "clockwork-stipend",
      chosenTrickleResource: "SUPPLY"
    });
  });

  it("rejects unknown trickle resource keys on CHOOSE_DOMAIN", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "CHOOSE_DOMAIN", domainId: "clockwork-stipend", chosenTrickleResource: "PLUTONIUM" })
    ).toThrow();
  });
});
