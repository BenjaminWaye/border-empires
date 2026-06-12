import { describe, expect, it } from "vitest";

import { rewriteGatewaySupportsMessageType, unsupportedRewriteMessageDetail } from "./client-gateway-capabilities.js";

describe("client gateway capabilities", () => {
  it("allows all messages when the server has not advertised rewrite capabilities", () => {
    expect(rewriteGatewaySupportsMessageType({ serverSupportedMessageTypes: new Set<string>() } as any, "SETTLE")).toBe(true);
  });

  it("blocks messages outside the advertised rewrite capability set", () => {
    expect(
      rewriteGatewaySupportsMessageType({ serverSupportedMessageTypes: new Set<string>(["ATTACK", "EXPAND"]) } as any, "SETTLE")
    ).toBe(false);
    expect(unsupportedRewriteMessageDetail("CHOOSE_TECH")).toContain("Technology unlocks");
  });
});
