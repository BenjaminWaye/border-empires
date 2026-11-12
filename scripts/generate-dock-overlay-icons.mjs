// Writes the 2D map's dock sprites (packages/client/public/overlays/dock-overlay-N.svg)
// as flat projections of the production 3D quay. Run after changing the harbour parts.
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "packages/client/package.json"));
const { build } = await import(pathToFileURL(join(dirname(require.resolve("vite/package.json")), "dist/node/index.js")).href);
const temporary = await mkdtemp(join(tmpdir(), "be-dock-icons-"));
try {
  await build({ configFile: false, logLevel: "warn", build: {
    outDir: temporary, emptyOutDir: false,
    lib: { entry: resolve(root, "packages/client/src/client-map-3d-harbour/harbour-overlay-svg.ts"), formats: ["es"], fileName: () => "dock-icons.mjs" }
  } });
  const { dockOverlaySvg, DOCK_OVERLAY_SVG_VARIANTS } = await import(pathToFileURL(join(temporary, "dock-icons.mjs")).href);
  for (const { filename, facing } of DOCK_OVERLAY_SVG_VARIANTS) {
    await writeFile(join(root, "packages/client/public/overlays", filename), dockOverlaySvg(facing));
  }
  console.log(`Generated ${DOCK_OVERLAY_SVG_VARIANTS.length} dock overlay sprites.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
