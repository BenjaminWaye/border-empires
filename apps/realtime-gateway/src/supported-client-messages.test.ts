import { describe, expect, it } from "vitest";
import { PHASE4_COMMAND_SURFACE_TYPES, RECONNECT_COMMAND_TYPES } from "../../../packages/sim-protocol/src/command-coverage-sets.js";

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

  it.each(RECONNECT_COMMAND_TYPES)("keeps durable command %s available on the websocket surface", (type) => {
    expect(supportedClientMessageTypes).toContain(type);
  });

  it.each(PHASE4_COMMAND_SURFACE_TYPES)("keeps phase-4 command-surface action %s available on the websocket surface", (type) => {
    expect(supportedClientMessageTypes).toContain(type);
  });
});
