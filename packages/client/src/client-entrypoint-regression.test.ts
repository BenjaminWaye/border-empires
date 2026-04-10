import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("client entrypoint regression guard", () => {
  it("loads the global stylesheet before booting the app shell", () => {
    const source = sourceFor("./main.ts");
    expect(source).toContain('import "./style.css";');
    expect(source).toContain('import "./client-app.js";');
  });

  it("loads the runtime through a dynamic import boundary", () => {
    const source = sourceFor("./client-app.ts");
    expect(source).toContain('import("./client-app-runtime.js")');
  });
});
