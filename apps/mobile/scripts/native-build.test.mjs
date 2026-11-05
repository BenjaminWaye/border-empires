import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const client = join(root, "packages/client");
const runClientBuild = (script, env) => {
  const result = spawnSync("pnpm", ["--filter", "@border-empires/client", script], {
    cwd: root, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, 0, `${script}: ${result.error?.message ?? ""}\n${result.stderr?.slice(-2000)}`);
};
const directoryDigest = (directory) => {
  const hash = createHash("sha256");
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      hash.update(child);
      if (entry.isDirectory()) visit(child);
      else hash.update(readFileSync(child));
    }
  };
  visit(directory);
  return hash.digest("hex");
};

test("native builds preserve the browser distribution and work without a legacy environment flag", { timeout: 180_000 }, () => {
  const env = { ...process.env };
  delete env.VITE_NATIVE_APP;
  runClientBuild("build", env);
  const browserDigest = directoryDigest(join(client, "dist"));
  runClientBuild("build:native", { ...env, VITE_NATIVE_APP: "true" });
  assert.equal(directoryDigest(join(client, "dist")), browserDigest, "Native build changed the browser distribution");
  rmSync(join(client, "dist-native"), { recursive: true, force: true });
  runClientBuild("build:native", env);
  assert.match(readFileSync(join(client, "dist-native/index.html"), "utf8"), /name="be-native-bundle"/);
  assert.equal(directoryDigest(join(client, "dist")), browserDigest);
});
