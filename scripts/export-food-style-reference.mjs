// Export actual district geometry for the Blender food-tile style study.
// Usage: node scripts/export-food-style-reference.mjs /absolute/output/directory
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const destination = process.argv[2];
if (!destination) throw new Error("Pass the Blender study output directory");
mkdirSync(destination, { recursive: true });
const repo = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(new URL("../packages/client/package.json", import.meta.url));
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");
const scratch = mkdtempSync(join(tmpdir(), "border-food-reference-"));
try {
  const entry = `import {createDistrictGeometry} from './packages/client/src/client-town-district/district-geometry.ts';
import fs from 'node:fs';
const models = {};
for (const kind of ['HYDROWORKS', 'MANUFACTORY']) {
  const model = createDistrictGeometry(kind, false);
  models[kind] = Object.fromEntries(Object.entries(model.layers).map(([layer, geometry]) => [layer, {
    positions: Array.from(geometry.getAttribute('position').array),
    colors: Array.from(geometry.getAttribute('color').array),
    indices: geometry.index ? Array.from(geometry.index.array) : null
  }]));
}
fs.writeFileSync(${JSON.stringify(resolve(destination, "reference-structures.json"))}, JSON.stringify(models));`;
  const outfile = join(scratch, "export.mjs");
  await build({ stdin: { contents: entry, resolveDir: repo, sourcefile: "reference-export.ts" }, bundle: true, platform: "node", format: "esm", outfile });
  execFileSync(process.execPath, [outfile], { stdio: "inherit" });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
