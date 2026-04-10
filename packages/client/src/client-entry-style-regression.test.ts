import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("client entry style regression", () => {
  it("keeps the global stylesheet imported from the client entrypoint", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

    expect(source).toContain('import "./style.css";');
    expect(source).toContain('import "./client-app.js";');
  });

  it("keeps the runtime behind a dynamic import boundary", () => {
    const source = readFileSync(new URL("./client-app.ts", import.meta.url), "utf8");

    expect(source).toContain('import("./client-app-runtime.js")');
  });
});
