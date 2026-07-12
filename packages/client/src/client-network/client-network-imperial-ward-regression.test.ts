import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Source-string
// assertions rather than a full WS-message integration test — client-network.ts
// is already over the file-line cap (frozen), so this locks in the wiring
// cheaply without adding to that file's test surface.
describe("client network Imperial Ward message regression", () => {
  it("imports and dispatches applyImperialWardActivatedMessage for IMPERIAL_WARD_ACTIVATED", () => {
    const networkSource = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");

    expect(networkSource).toContain(
      'import { applyImperialWardActivatedMessage } from "../client-imperial-ward/client-imperial-ward.js";'
    );
    expect(networkSource).toContain('if (msg.type === "IMPERIAL_WARD_ACTIVATED")');
    expect(networkSource).toContain("applyImperialWardActivatedMessage(state, msg);");
  });

  it("syncs imperialWardCharges from both INIT and PLAYER_UPDATE player payloads", () => {
    const networkSource = readFileSync(new URL("./client-network.ts", import.meta.url), "utf8");

    expect(networkSource).toContain("state.imperialWardCharges = (player as { imperialWardCharges?: number }).imperialWardCharges;");
    expect(networkSource).toContain('(msg as { imperialWardCharges?: unknown }).imperialWardCharges === "number"');
  });
});
