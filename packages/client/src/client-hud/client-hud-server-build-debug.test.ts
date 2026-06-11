import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client HUD server-build debug regression", () => {
  // The bridge debug card shows the gateway/sim BUILD_SHA next to the
  // client's so the user can confirm both ends shipped from the same commit.
  // If either the state field, the render line, or the copy-payload line is
  // dropped during a refactor, this test fails before the deploy goes out
  // — and a stale-server-vs-fresh-client mismatch goes back to being
  // invisible (the bug that motivated this card).
  it("reads serverBuildSha from state and renders a Server build line in the debug card", () => {
    const hudSource = readFileSync(new URL("./client-hud.ts", import.meta.url), "utf8");

    expect(hudSource).toContain("state.bridgeDebugServerBuildSha");
    expect(hudSource).toContain("<strong>Server build</strong>");
    expect(hudSource).toContain("Server build ${serverBuildLabel}");
    expect(hudSource).toContain("⚠ mismatch");
  });

  it("ingests serverBuildSha from the INIT message into client state", () => {
    const networkSource = readFileSync(new URL("../client-network/client-network.ts", import.meta.url), "utf8");

    expect(networkSource).toContain("incomingServerBuildSha");
    expect(networkSource).toContain("state.bridgeDebugServerBuildSha");
  });
});
