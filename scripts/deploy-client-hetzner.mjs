#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { checkStagingRealtime } from "./verify-staging-realtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const environment = process.argv[2];
if (environment !== "staging" && environment !== "production") {
  throw new Error("Usage: node scripts/deploy-client-hetzner.mjs <staging|production>");
}
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (process.env.GIT_COMMIT_SHA && process.env.GIT_COMMIT_SHA !== sha) {
  throw new Error("Build SHA must match the checked-out commit");
}
const hostname = environment === "staging" ? "api-staging.borderempires.com" : "api.borderempires.com";
const target = process.env.BE_CLIENT_SSH_TARGET ?? `deploy@${environment === "staging" ? "178.105.133.33" : "188.245.240.42"}`;
if (!/^[A-Za-z0-9@._-]+$/.test(target) || target.startsWith("-")) throw new Error("Invalid SSH target");
const env = {
  ...process.env,
  GIT_COMMIT_SHA: sha,
  VITE_GATEWAY_WS_URL: `wss://${hostname}/ws`,
  VITE_WS_URL: `wss://${hostname}/ws`,
  VITE_BACKEND_DEFAULT: "gateway",
  WORLD_WIDTH: process.env.WORLD_WIDTH ?? "640",
  WORLD_HEIGHT: process.env.WORLD_HEIGHT ?? "320"
};
execFileSync("pnpm", ["--filter", "@border-empires/shared", "--filter", "@border-empires/client-protocol", "build"], { cwd: root, env, stdio: "inherit" });
execFileSync("pnpm", ["--filter", "@border-empires/client", "build"], { cwd: root, env, stdio: "inherit" });
writeFileSync(new URL("../packages/client/dist/__build_sha.txt", import.meta.url), `${sha}\n`);

const archive = spawn("tar", ["-czf", "-", "-C", "packages/client/dist", "."], {
  cwd: root, env: { ...process.env, COPYFILE_DISABLE: "1" }, stdio: ["ignore", "pipe", "inherit"]
});
const upload = spawn("ssh", ["-o", "BatchMode=yes", target, `/opt/border-empires/bin/deploy client ${sha}`], { stdio: ["pipe", "inherit", "inherit"] });
const completion = (child) => new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Deploy subprocess exited ${code}`)));
});
await Promise.all([completion(archive), completion(upload), pipeline(archive.stdout, upload.stdin)]);
try {
  const marker = await fetch(`https://${hostname}/__build_sha.txt`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!marker.ok || (await marker.text()).trim() !== sha) throw new Error("Published client SHA verification failed");
  const shell = await fetch(`https://${hostname}/`, { signal: AbortSignal.timeout(10000) });
  if (!shell.ok || !(await shell.text()).includes('<canvas id="game"></canvas>')) throw new Error("Published game page verification failed");
  await checkStagingRealtime({ healthUrl: `https://${hostname}/health`, wsUrl: `wss://${hostname}/ws?channel=control` });
} catch (error) {
  execFileSync("ssh", ["-o", "BatchMode=yes", target, "/opt/border-empires/bin/deploy client-rollback"], { stdio: "inherit" });
  throw error;
}
console.log(`${environment} client verified: https://${hostname}/ (${sha})`);
