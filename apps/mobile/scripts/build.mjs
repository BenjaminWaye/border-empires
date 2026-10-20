import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mobileBuildEnv } from "./build-options.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const app = fileURLToPath(new URL("../", import.meta.url));
const environment = process.env.MOBILE_ENV ?? "production";
const env = { ...process.env, ...mobileBuildEnv(environment) };
const build = spawnSync("pnpm", ["--filter", "@border-empires/client^...", "build"], { cwd: root, env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const client = spawnSync("pnpm", ["--filter", "@border-empires/client", "build:native"], { cwd: root, env, stdio: "inherit" });
if (client.status !== 0) process.exit(client.status ?? 1);
const builtIndex = readFileSync(new URL("../../../packages/client/dist-native/index.html", import.meta.url), "utf8");
if (!builtIndex.includes('name="be-native-bundle"')) throw new Error("Refusing to package a browser bundle as a native app.");
const webDir = new URL("../www/", import.meta.url);
rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });
cpSync(new URL("../../../packages/client/dist-native/", import.meta.url), webDir, { recursive: true });
writeFileSync(new URL("build-environment.json", webDir), JSON.stringify({
  environment,
  gateway: env.VITE_GATEWAY_WS_URL,
  publicOrigin: env.VITE_NATIVE_PUBLIC_ORIGIN,
  rallyApi: env.VITE_RALLY_API_ORIGIN
}));
console.log(`Mobile ${environment} bundle ready in ${app}www`);
