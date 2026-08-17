import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// client-map-3d-render-target.ts turns on ACESFilmicToneMapping for the whole
// scene. That's correct for the lit terrain/water/structure materials, but
// wrong for the map's unlit MeshBasicMaterial/SpriteMaterial instances —
// ownership tints, selection highlights, badges, targeting overlays — which
// are chosen for gameplay legibility, not lighting, and would desaturate
// under the filmic curve. Each of those call sites sets `toneMapped: false`
// as its first constructor property (see the sweep this test guards).
//
// This walks the source tree rather than unit-testing each overlay's
// constructed material, because the invariant that actually matters is "no
// future `new MeshBasicMaterial({` call sneaks in without the flag" — a
// single structural check catches every existing and future call site at
// once, the way client-settlement-overlay-regression.test.ts guards its own
// source-level invariants.

const CALL_PATTERN = /new (MeshBasicMaterial|SpriteMaterial)\(\{/g;
const GUARD_PATTERN = /new (MeshBasicMaterial|SpriteMaterial)\(\{\s*toneMapped:\s*false\b/;

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const walkTsFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files.push(...walkTsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
};

describe("tone mapping opt-out regression guard", () => {
  it("gives every unlit MeshBasicMaterial/SpriteMaterial construction toneMapped: false", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const source = readFileSync(file, "utf8");
      const calls = source.match(CALL_PATTERN);
      if (!calls) continue;
      // One combined regex per call site rather than counting matches: a file
      // with N calls needs N guarded openings, and re-scanning per-call-site
      // text is what actually verifies each individual site rather than just
      // the file as a whole having *a* guarded call somewhere in it.
      let searchFrom = 0;
      for (let i = 0; i < calls.length; i += 1) {
        const openIndex = source.indexOf(calls[i]!, searchFrom);
        const window = source.slice(openIndex, openIndex + 80);
        if (!GUARD_PATTERN.test(window)) {
          offenders.push(`${file.replace(srcRoot, ".")}:${source.slice(0, openIndex).split("\n").length}`);
        }
        searchFrom = openIndex + calls[i]!.length;
      }
    }
    expect(offenders).toEqual([]);
  });

  // Confirms the pattern itself still matches this codebase's actual call
  // style, so the guard above can't pass by silently matching zero files.
  it("finds a non-trivial number of unlit material call sites to guard", () => {
    let total = 0;
    for (const file of walkTsFiles(srcRoot)) {
      const source = readFileSync(file, "utf8");
      total += (source.match(CALL_PATTERN) ?? []).length;
    }
    expect(total).toBeGreaterThan(50);
  });
});
