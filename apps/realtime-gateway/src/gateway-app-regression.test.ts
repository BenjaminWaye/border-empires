import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("gateway fog capability regression guard", () => {
  it("stores the fog-admin capability on the live session and reuses it for init and player updates", () => {
    const source = sourceFor("./gateway-app.ts");

    expect(source).toContain("canToggleFog: boolean;");
    expect(source).toContain("canToggleFog: false");
    expect(source).toContain("session.canToggleFog = canToggleFogForEmail(playerIdentity.authEmail, options.fogAdminEmail);");
    expect(source).toContain("session.canToggleFog\n              );");
    expect(source).toContain("canToggleFog: session.canToggleFog");
    expect(source).not.toContain("session.authEmail");
  });
});
