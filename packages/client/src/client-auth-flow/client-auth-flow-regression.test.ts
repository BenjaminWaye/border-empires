import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./client-auth-flow.ts"), "utf8"),
    readFileSync(resolve(here, "../client-network/client-network.ts"), "utf8")
  ].join("\n");
};

describe("client auth flow regression guard", () => {
  it("uses the cached Firebase token for initial auth bootstrap and reserves forced refresh for auth failures", () => {
    const source = clientSource();

    expect(source).toContain('state.authBusyDetail = "Loading your Google session and waiting for the realtime server connection.";');
    expect(source).toContain("authSession.token = await user.getIdToken();");
    expect(source).toContain("void authenticateSocket(true)");
    expect(source).not.toContain("authSession.token = await user.getIdToken(true);");
  });

  it("reloads the map reveal after the debug account signs in and clears it on sign-out", () => {
    const source = clientSource();

    expect(source).toContain('setDebugAuthEmail("");');
    expect(source).toContain("state.mapRevealEligible = false;");
    expect(source).toContain("state.mapRevealEnabled = false;");
    expect(source).toContain("state.authEmail = authEmail ?? \"\";");
    expect(source).toContain("state.mapRevealEnabled = getMapRevealEnabled({");
    expect(source).toContain("state.mapRevealEligible = Boolean(player.canToggleFog);");
    expect(source).toContain("const syncDesiredFogDisabled = (): void => {");
    expect(source).toContain('state.serverSupportedMessageTypes.has("REQUEST_REVEAL_MAP")');
    expect(source).toContain('state.mapRevealEnabled ? { type: "REQUEST_REVEAL_MAP" } : { type: "SET_FOG_DISABLED", disabled: false }');
    expect(source.indexOf("state.mapRevealEligible = Boolean(player.canToggleFog);")).toBeLessThan(
      source.indexOf("syncDesiredFogDisabled();")
    );
  });
});
