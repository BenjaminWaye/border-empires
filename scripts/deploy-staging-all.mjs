#!/usr/bin/env node
// Single-command staging deploy orchestrator.
//
// Why this exists:
//   - Vercel git integration on the `staging` branch and the manual
//     `pnpm deploy:client:staging` script were both promoting deployments and
//     racing on the alias, so the latest commit on main was not always what
//     `staging.borderempires.com` actually served.
//   - Sim/gateway Fly deploys were entirely manual and order-sensitive
//     (gateway depends on sim being up after a proto change), so partial
//     redeploys frequently left staging broken.
//   - Many agents push to main concurrently; we want "latest commit wins"
//     semantics on staging, end-to-end, in one command.
//
// What this does, in order:
//   1. Fetches origin/main and reads its SHA.
//   2. Asserts the local working tree HEAD matches origin/main and is clean.
//      `fly deploy` ships the local checkout, so deploying from a stale tree
//      would label new SHAs onto old code (this is how the #184 forest-claim
//      fix shipped to origin/staging without landing in the sim image).
//   3. Force-pushes origin/main onto origin/staging so the staging branch
//      tracks bleeding-edge main.
//   4. Builds workspace internal packages (shared, sim-protocol, etc.) so the
//      Fly + Vercel build steps don't trip over stale typings.
//   5. Deploys the merged sim+gateway to Fly
//      (border-empires-combined-staging) with a rolling strategy so the
//      prior machine stays live until the new one is healthy. The split
//      sim/gateway apps were retired when staging cut over to the
//      single-process SQLite-only build (PR #177).
//   7. Writes the target SHA to packages/client/public/__build_sha.txt so the
//      client bundle ships it as a static asset (`/__build_sha.txt`). Anyone
//      with Vercel SSO access to staging.borderempires.com can hit that
//      endpoint to confirm which commit is live.
//   8. Runs the existing deploy-client-staging.mjs to publish the client and
//      flip the staging alias. That script already verifies the alias swap.
//
// Concurrency:
//   - Fly serializes concurrent deploys per app (rolling strategy keeps the
//     prior machine running until the new one is healthy), and the Vercel
//     alias swap is atomic, so two agents racing on this script end up with
//     "whichever finishes last wins" — correct semantics for staging.
//   - We do not attempt to short-circuit when the live SHA already matches:
//     staging.borderempires.com is gated behind Vercel SSO so we can't read
//     the marker over plain HTTP from CI/agents. Re-running this script when
//     staging is already at the target SHA is cheap (Fly redeploys roll the
//     same image; Vercel re-runs the build but the alias swap is a no-op).

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingClientAlias = process.env.STAGING_CLIENT_ALIAS ?? "staging.borderempires.com";
const buildShaArtifactPath = resolve(rootDir, "packages/client/public/__build_sha.txt");

const log = (msg) => console.log(`\n[deploy-staging-all] ${msg}`);
const fail = (msg) => {
  console.error(`\n[deploy-staging-all] ERROR: ${msg}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
};

const captureStdout = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}: ${(result.stderr ?? "").trim()}`);
  }
  return result.stdout.trim();
};

const main = async () => {
  log("Fetching origin/main");
  run("git", ["fetch", "origin", "main"]);
  const targetSha = captureStdout("git", ["rev-parse", "origin/main"]);
  const targetShortSha = targetSha.slice(0, 7);
  log(`Target SHA: ${targetSha} (${targetShortSha})`);

  // `fly deploy` ships the local working tree, but we stamp `origin/main`
  // onto `origin/staging` and onto `__build_sha.txt`. If the working tree
  // does not match `origin/main` exactly, staging gets old code labelled
  // with a new SHA — which is how the #184 forest-claim fix shipped to
  // origin/staging without actually landing in the simulation image.
  // Refuse to deploy unless HEAD matches origin/main and the tree is clean.
  const headSha = captureStdout("git", ["rev-parse", "HEAD"]);
  if (headSha !== targetSha) {
    fail(
      `working tree HEAD ${headSha.slice(0, 7)} does not match origin/main ${targetShortSha}. ` +
        `fly deploy ships the local working tree, so deploying from a stale checkout would publish old code under the new SHA. ` +
        `Run this from a worktree checked out at origin/main (e.g. ` +
        `\`bash scripts/create-worktree.sh deploy-staging origin/main && cd .codex-worktrees/deploy-staging\`).`
    );
  }
  const dirtyStatus = captureStdout("git", ["status", "--porcelain"]);
  if (dirtyStatus.length > 0) {
    fail(
      `working tree has uncommitted changes; refusing to deploy because fly would ship them as part of the staging image:\n${dirtyStatus}`
    );
  }

  log("Force-pushing origin/main onto origin/staging");
  run("git", ["push", "origin", `${targetSha}:refs/heads/staging`, "--force"]);

  log("Building workspace internal packages");
  run("pnpm", [
    "--filter", "@border-empires/shared",
    "--filter", "@border-empires/client-protocol",
    "--filter", "@border-empires/sim-protocol",
    "--filter", "@border-empires/game-domain",
    "build"
  ]);

  log("Deploying merged sim+gateway to Fly (border-empires-combined-staging)");
  // BUILD_SHA is read by the gateway at startup and surfaced via the INIT
  // payload so the client's bridge debug card can show client-vs-server SHA
  // side by side. Fly persists --env across machine restarts, so a stop/start
  // serves the same image with the same SHA — the only way it diverges from
  // the live SHA is a re-deploy, which is exactly when we want it to change.
  run("fly", [
    "deploy",
    "--config", "fly.combined.staging.toml",
    "--strategy", "rolling",
    "--local-only",
    "--env", `BUILD_SHA=${targetSha}`
  ]);

  log(`Writing build SHA marker to ${buildShaArtifactPath}`);
  mkdirSync(dirname(buildShaArtifactPath), { recursive: true });
  writeFileSync(buildShaArtifactPath, `${targetSha}\n`, "utf8");

  log("Running client staging deploy");
  run("node", ["./scripts/deploy-client-staging.mjs"], {
    env: {
      ...process.env,
      // Orchestrator runs from arbitrary branches; the underlying script
      // requires `staging`. Bypass since this orchestrator is the only
      // sanctioned promotion path and we have already pushed origin/staging.
      ALLOW_NON_STAGING_BRANCH_DEPLOY: "1"
    }
  });

  log(`Staging release complete. https://${stagingClientAlias}/__build_sha.txt should now report ${targetSha}.`);
};

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
