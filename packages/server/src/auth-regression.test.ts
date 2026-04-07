import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./main.ts"), "utf8"),
    readFileSync(resolve(here, "./server-auth.ts"), "utf8")
  ].join("\n");
};

describe("auth verification regression guard", () => {
  it("caps Firebase verification time so JWKS stalls do not block login for seconds", () => {
    const source = serverMainSource();
    expect(source).toContain("export const AUTH_VERIFY_TIMEOUT_MS = Math.max(750");
    expect(source).toContain("return await Promise.race([");
    expect(source).toContain("AuthVerifyTimeout after ${AUTH_VERIFY_TIMEOUT_MS}ms");
  });

  it("reuses verified identity by uid when the Firebase token rotates", () => {
    const source = serverMainSource();
    expect(source).toContain("const verifiedFirebaseIdentityByUid = new Map");
    expect(source).toContain("const cachedFirebaseIdentityForDecodedToken = (");
    expect(source).toContain("const decoded = decodeFirebaseTokenFallback(token);");
    expect(source).toContain("const cachedByUid = cachedFirebaseIdentityForUid(decoded.uid);");
    expect(source).toContain("verifiedFirebaseIdentityByUid.set(decoded.uid, { decoded, expiresAt });");
    expect(source).toContain("let decoded = cachedFirebaseIdentityForDecodedToken(msg.token);");
  });

  it("accepts a structurally valid Firebase token immediately for already known uid identities", () => {
    const source = serverMainSource();
    expect(source).toContain("const decodedFallback = decodeFirebaseTokenFallback(msg.token);");
    expect(source).toContain("const knownIdentity = authIdentityByUid.get(decodedFallback.uid);");
    expect(source).toContain('"firebase token verification bypass using known uid fallback"');
  });

  it("falls back to cached or decoded Firebase identity when verification is unavailable", () => {
    const source = serverMainSource();
    expect(source).toContain("const verified = await verifyFirebaseToken(msg.token);");
    expect(source).toContain("if (!decoded) decoded = cachedFirebaseIdentityForDecodedToken(msg.token);");
    expect(source).toContain('text.includes("AuthVerifyTimeout")');
    expect(source).toContain('app.log.warn({ err }, "firebase token verification fallback to cached identity");');
    expect(source).toContain("const fallback = decodedFallback ?? decodeFirebaseTokenFallback(msg.token);");
    expect(source).toContain('\"firebase token verification fallback to unverified payload\"');
  });

  it("defers heavy init supplement work until after the base init is sent", () => {
    const source = serverMainSource();
    expect(source).toContain('type: "INIT"');
    expect(source).toContain("setTimeout(() => {");
    expect(source).toContain('type: "TECH_UPDATE"');
    expect(source).toContain('type: "GLOBAL_STATUS_UPDATE"');
  });
});
