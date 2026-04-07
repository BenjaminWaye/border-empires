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
  it("reuses verified identity by uid when the Firebase token rotates", () => {
    const source = serverMainSource();
    expect(source).toContain("const verifiedFirebaseIdentityByUid = new Map");
    expect(source).toContain("const cachedFirebaseIdentityForDecodedToken = (");
    expect(source).toContain("const decoded = decodeFirebaseTokenFallback(token);");
    expect(source).toContain("const cachedByUid = cachedFirebaseIdentityForUid(decoded.uid);");
    expect(source).toContain("verifiedFirebaseIdentityByUid.set(decoded.uid, { decoded, expiresAt });");
    expect(source).toContain("let decoded = cachedFirebaseIdentityForDecodedToken(msg.token);");
  });

  it("falls back to cached or decoded Firebase identity when verification is unavailable", () => {
    const source = serverMainSource();
    expect(source).toContain("const verified = await verifyFirebaseToken(msg.token);");
    expect(source).toContain("if (!decoded) decoded = cachedFirebaseIdentityForDecodedToken(msg.token);");
    expect(source).toContain('app.log.warn({ err }, "firebase token verification fallback to cached identity");');
    expect(source).toContain('const fallback = decodeFirebaseTokenFallback(msg.token);');
    expect(source).toContain('\"firebase token verification fallback to unverified payload\"');
  });
});
