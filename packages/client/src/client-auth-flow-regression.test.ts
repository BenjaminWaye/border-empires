import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./client-auth-flow.ts"), "utf8"),
    readFileSync(resolve(here, "./client-network.ts"), "utf8")
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
});
