import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
    lib: { entry: resolve(root, "packages/client/src/client-town-district/district-icon-svg.ts"), formats: ["es"], fileName: () => "icons.mjs" }
  } });
  const { districtIconSvg, districtIconKinds } = await import(pathToFileURL(join(temporary, "icons.mjs")).href);
  const destination = join(root, "packages/client/public/overlays/town-district");
  await mkdir(destination, { recursive: true });
  for (const kind of districtIconKinds()) {
    await writeFile(join(destination, `${kind.toLowerCase().replaceAll("_", "-")}.svg`), districtIconSvg(kind));
  }
  console.log(`Generated ${districtIconKinds().length} district icons from the production models.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
