import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "packages/client/package.json"));
const { build } = await import(pathToFileURL(join(dirname(require.resolve("vite/package.json")), "dist/node/index.js")).href);
const temporary = await mkdtemp(join(tmpdir(), "be-district-icons-"));
try {
  await build({ configFile: false, logLevel: "warn", build: {
    outDir: temporary, emptyOutDir: false,
    lib: { entry: resolve(root, "packages/client/src/client-structure-info-catalog/structure-review-svg.ts"), formats: ["es"], fileName: () => "icons.mjs" }
  } });
  const { structureReviewSvg } = await import(pathToFileURL(join(temporary, "icons.mjs")).href);
  await writeFile(join(root, "packages/client/public/overlays/sovereign-siege-engine-overlay.svg"), structureReviewSvg("SOVEREIGN_SIEGE_ENGINE"));
  console.log("Generated Sovereign Siege Engine artwork from the production model.");
} finally { await rm(temporary, { recursive: true, force: true }); }
