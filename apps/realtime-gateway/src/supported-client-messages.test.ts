import { describe, expect, it } from "vitest";

import { supportedClientMessageTypes } from "./supported-client-messages.js";

describe("supported client messages", () => {
  it("advertises the migrated social and diplomacy messages", () => {
    expect(supportedClientMessageTypes).toContain("ALLIANCE_REQUEST");
    expect(supportedClientMessageTypes).toContain("ALLIANCE_ACCEPT");
    expect(supportedClientMessageTypes).toContain("ALLIANCE_REJECT");
    expect(supportedClientMessageTypes).toContain("ALLIANCE_CANCEL");
    expect(supportedClientMessageTypes).toContain("ALLIANCE_BREAK");
    expect(supportedClientMessageTypes).toContain("TRUCE_REQUEST");
    expect(supportedClientMessageTypes).toContain("TRUCE_ACCEPT");
    expect(supportedClientMessageTypes).toContain("TRUCE_REJECT");
    expect(supportedClientMessageTypes).toContain("TRUCE_CANCEL");
    expect(supportedClientMessageTypes).toContain("TRUCE_BREAK");
  });
});
