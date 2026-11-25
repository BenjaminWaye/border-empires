import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { offerOptionsFor } from "./diplomacy-offer-options.js";

// Playtest Run 4 follow-up: truce and alliance offers may carry one preset line, never free text.
describe("offer notes", () => {
  it("passes a preset line through to the stored offer", () => {
    expect(offerOptionsFor({ note: "common-enemy" })).toEqual({ note: "common-enemy" });
    expect(offerOptionsFor({})).toEqual({});
  });

  it("accepts preset ids on TRUCE_REQUEST and ALLIANCE_REQUEST and rejects anything else", () => {
    expect(ClientMessageSchema.safeParse({ type: "TRUCE_REQUEST", targetPlayerName: "Tove", durationHours: 12, note: "quiet-border" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "ALLIANCE_REQUEST", targetPlayerName: "Tove", note: "grow-together" }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "ALLIANCE_REQUEST", targetPlayerName: "Tove", note: "free text from a player" }).success).toBe(false);
  });
});
