import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("startup auth regression guard", () => {
  it("keeps AI paused briefly after startup so login is not competing with boot-time AI work", () => {
    const source = serverMainSource();
    expect(source).toContain("const AI_BOOT_GRACE_MS = Math.max(5_000");
    expect(source).toContain("Date.now() - startupState.completedAt < AI_BOOT_GRACE_MS");
    expect(source).toContain("registerInterval(() => {");
    expect(source).toContain("runAiTick();");
  });
});
