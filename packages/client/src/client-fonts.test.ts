import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

describe("fonts", () => {
  it("are never loaded from Google: the client source and pages name no Google Fonts host", () => {
    const sources = [...files(join(__dirname)), ...files(join(__dirname, "..", "public")), join(__dirname, "..", "index.html")]
      .filter((path) => /\.(ts|css|html)$/.test(path) && !path.endsWith("client-fonts.test.ts"));
    const offenders = sources.filter((path) => /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
