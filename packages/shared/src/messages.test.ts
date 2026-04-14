import { describe, expect, it } from "vitest";

import { ClientMessageSchema } from "./messages.js";

describe("ClientMessageSchema", () => {
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
});
