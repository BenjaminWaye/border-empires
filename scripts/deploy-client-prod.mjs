import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { aliasServesExpectedBundle, parseBundleAssetPath, parseDeploymentUrl } from "./client-deploy-verify.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const vercelConfig = path.join(repoRoot, "vercel.client.json");
const clientIndexPath = path.join(repoRoot, "packages/client/dist/index.html");
const publicAlias = "https://border-empires-client.vercel.app";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  return run("curl", ["-sS", "-m", "20", url]);
}

async function main() {
  console.log("Building shared package...");
  run("pnpm", ["--filter", "@border-empires/shared", "build"], { stdio: "inherit" });

  console.log("Building client package...");
  run("pnpm", ["--filter", "@border-empires/client", "build"], { stdio: "inherit" });

  const localHtml = fs.readFileSync(clientIndexPath, "utf8");
  const expectedBundlePath = parseBundleAssetPath(localHtml);
  if (!expectedBundlePath) {
    throw new Error(`Could not parse client bundle path from ${clientIndexPath}`);
  }

  console.log(`Expected public client bundle: ${expectedBundlePath}`);
  console.log("Deploying client to Vercel production...");
  const deployOutput = run("npx", ["vercel", "--prod", "--yes", "--local-config", vercelConfig]);
  process.stdout.write(deployOutput);

  const deploymentUrl = parseDeploymentUrl(deployOutput);
  if (!deploymentUrl) {
    throw new Error("Could not parse deployment URL from Vercel output.");
  }

  console.log(`Forcing public alias ${publicAlias} -> ${deploymentUrl}`);
  run("npx", ["vercel", "alias", "set", deploymentUrl, "border-empires-client.vercel.app", "--local-config", vercelConfig], {
    stdio: "inherit"
  });

  console.log("Verifying public alias serves the new bundle...");
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const aliasHtml = await fetchHtml(publicAlias);
    if (aliasServesExpectedBundle(aliasHtml, expectedBundlePath)) {
      console.log(`Verified on attempt ${attempt}: public alias serves ${expectedBundlePath}`);
      return;
    }
    console.log(`Attempt ${attempt} did not serve ${expectedBundlePath}; retrying...`);
    await sleep(3000);
  }

  throw new Error(`Public alias ${publicAlias} did not serve expected bundle ${expectedBundlePath} after retries.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
