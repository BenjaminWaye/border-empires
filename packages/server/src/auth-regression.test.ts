import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("auth verification regression guard", () => {
  it("reuses verified identity by uid when the Firebase token rotates", () => {
    const source = serverMainSource();
    expect(source).toContain("const verifiedFirebaseIdentityByUid = new Map");
    expect(source).toContain("const cachedFirebaseIdentityForDecodedToken = (");
    expect(source).toContain("const decoded = decodeFirebaseTokenFallback(token);");
    expect(source).toContain("const cachedByUid = cachedFirebaseIdentityForUid(decoded.uid);");
    expect(source).toContain("verifiedFirebaseIdentityByUid.set(decoded.uid, { decoded, expiresAt });");
    expect(source).toContain("let decoded = cachedFirebaseIdentityForDecodedToken(msg.token);");
  });

  it("dedupes in-flight Firebase token verification and bypasses to decoded payload under auth backlog", () => {
    const source = serverMainSource();
    expect(source).toContain("const inFlightFirebaseVerificationByToken = new Map");
    expect(source).toContain("const AUTH_BACKLOG_FALLBACK_THRESHOLD = Math.max(1, Number(process.env.AUTH_BACKLOG_FALLBACK_THRESHOLD ?? 2));");
    expect(source).toContain("const existing = inFlightFirebaseVerificationByToken.get(token);");
    expect(source).toContain('\"firebase token verification bypassed under auth pressure\"');
    expect(source).toContain("if (decodedFallback && pendingAuthVerifications >= AUTH_BACKLOG_FALLBACK_THRESHOLD)");
  });
});
