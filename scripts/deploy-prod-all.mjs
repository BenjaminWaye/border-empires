#!/usr/bin/env node
// Single-command production deploy orchestrator.
//
// Mirrors deploy-staging-all.mjs with the safety controls that prod warrants:
//   1. Typed-confirmation prompt before any remote action runs. The operator
//      must type `DEPLOY PROD <short-sha>` to continue.
//   2. Tag every successful release as `prod-YYYYMMDDHHMMSS-<short-sha>` and
//      push the tag to origin so prod history is greppable.
//   3. Force-push origin/main onto origin/production so the `production`
//      branch always tracks the last successful deploy (parallel to how
//      staging tracks origin/main on origin/staging).
//   4. Pass PRODUCTION_GATEWAY_WS_URL through to the client build so the
//      bundle hardcodes wss://border-empires-combined.fly.dev/ws and the
//      client defaults to the rewrite gateway in prod.
//
// What this does, in order:
//   1. Fetch origin/main; capture target SHA.
//   2. Assert working tree HEAD matches origin/main and is clean (fly deploy
//      ships the local checkout).
//   3. Prompt for typed confirmation `DEPLOY PROD <short-sha>`. Skip with
//      ALLOW_UNCONFIRMED_PROD_DEPLOY=1 (for CI/automation only).
//   4. Build workspace internal packages so Fly + Vercel build steps have
//      fresh typings.
//   5. Verify a recent successful prod-shape gate result for the target SHA.
//   6. Force-push origin/main → origin/production.
//   7. Tag prod-YYYYMMDDHHMMSS-<short-sha> and push the tag.
//   8. Deploy fly.combined.toml with --strategy rolling --remote-only so the
//      live prod machine stays serving until the new one is healthy.
//   9. Write __build_sha.txt so /__build_sha.txt on play.borderempires.com
//      reports which commit is live.
//   10. Run deploy-client-prod.mjs with PRODUCTION_GATEWAY_WS_URL injected so
//      the Vite build bakes the prod WS URL into the bundle.
//
// Concurrency / idempotence:
//   - Fly serializes deploys per app; Vercel alias swap is atomic.
//   - Re-running this script when prod is already at the target SHA is
//     cheap: fly redeploys the same image, Vercel re-runs the build but
//     the alias swap is a no-op.
//
// Rollback: see plan docs/plans/2026-05-14-prod-launch.md §Phase 4 — the
//   `vercel alias` command for the previous production deployment swings
//   play.borderempires.com back in <2 min. The legacy fly app remains
//   running but unreferenced until Phase 7 cleanup.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productionClientAlias = process.env.PRODUCTION_CLIENT_ALIAS ?? "play.borderempires.com";
const productionGatewayWsUrl =
  process.env.PRODUCTION_GATEWAY_WS_URL ?? "wss://border-empires-combined.fly.dev/ws";
const buildShaArtifactPath = resolve(rootDir, "packages/client/public/__build_sha.txt");

const log = (msg) => console.log(`\n[deploy-prod-all] ${msg}`);
const fail = (msg) => {
  console.error(`\n[deploy-prod-all] ERROR: ${msg}`);
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

const prompt = (question) =>
  new Promise((resolveAnswer) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolveAnswer(answer);
    });
  });

const formatUtcStamp = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}`
  );
};

const main = async () => {
  log("Fetching origin/main");
  run("git", ["fetch", "origin", "main"]);
  const targetSha = captureStdout("git", ["rev-parse", "origin/main"]);
  const targetShortSha = targetSha.slice(0, 7);
  log(`Target SHA: ${targetSha} (${targetShortSha})`);

  const headSha = captureStdout("git", ["rev-parse", "HEAD"]);
  if (headSha !== targetSha) {
    fail(
      `working tree HEAD ${headSha.slice(0, 7)} does not match origin/main ${targetShortSha}. ` +
        `fly deploy ships the local working tree, so deploying from a stale checkout would publish old code under the new SHA. ` +
        `Run this from a worktree checked out at origin/main (e.g. ` +
        `\`bash scripts/create-worktree.sh deploy-prod origin/main && cd .codex-worktrees/deploy-prod\`).`
    );
  }
  const dirtyStatus = captureStdout("git", ["status", "--porcelain"]);
  if (dirtyStatus.length > 0) {
    fail(
      `working tree has uncommitted changes; refusing to deploy because fly would ship them as part of the prod image:\n${dirtyStatus}`
    );
  }

  if (process.env.ALLOW_UNCONFIRMED_PROD_DEPLOY !== "1") {
    const expected = `DEPLOY PROD ${targetShortSha}`;
    const answer = (await prompt(
      `\nAbout to deploy ${targetShortSha} to production (border-empires-combined.fly.dev + ${productionClientAlias}).\n` +
        `Type '${expected}' to continue: `
    )).trim();
    if (answer !== expected) {
      fail(`confirmation phrase did not match. Expected '${expected}', got '${answer}'.`);
    }
  } else {
    log("ALLOW_UNCONFIRMED_PROD_DEPLOY=1 — skipping typed confirmation");
  }

  log("Building workspace internal packages");
  run("pnpm", [
    "--filter", "@border-empires/shared",
    "--filter", "@border-empires/client-protocol",
    "--filter", "@border-empires/sim-protocol",
    "--filter", "@border-empires/game-domain",
    "build"
  ]);

  if (process.env.SKIP_PROD_SHAPE_GATE === "1") {
    log("SKIP_PROD_SHAPE_GATE=1 — bypassing required prod-shape deploy gate");
  } else {
    log("Verifying required prod-shape gate result");
    run("node", ["./scripts/check-prod-shape-gate-result.mjs", "--target-sha", targetSha], {
      env: {
        ...process.env,
        PROD_SHAPE_TARGET_SHA: targetSha
      }
    });
  }

  log("Force-pushing origin/main onto origin/production");
  run("git", ["push", "origin", `${targetSha}:refs/heads/production`, "--force"]);

  const releaseTag = `prod-${formatUtcStamp(new Date())}-${targetShortSha}`;
  log(`Tagging release ${releaseTag}`);
  run("git", ["tag", "--force", releaseTag, targetSha]);
  run("git", ["push", "origin", releaseTag, "--force"]);

  log("Deploying merged sim+gateway to Fly (border-empires-combined)");
  // BUILD_SHA is read by the gateway at startup and surfaced via the INIT
  // payload so the client's bridge debug card can show client-vs-server SHA
  // side by side. Fly persists --env across machine restarts, so a stop/start
  // serves the same image with the same SHA — the only way it diverges from
  // the live SHA is a re-deploy, which is exactly when we want it to change.
  run("fly", [
    "deploy",
    "--config", "fly.combined.toml",
    "--strategy", "rolling",
    "--local-only",
    "--env", `BUILD_SHA=${targetSha}`
  ]);

  log(`Writing build SHA marker to ${buildShaArtifactPath}`);
  mkdirSync(dirname(buildShaArtifactPath), { recursive: true });
  writeFileSync(buildShaArtifactPath, `${targetSha}\n`, "utf8");

  log("Running client prod deploy");
  run("node", ["./scripts/deploy-client-prod.mjs"], {
    env: {
      ...process.env,
      // deploy-client-prod.mjs picks these up to inject into the Vite build.
      VITE_GATEWAY_WS_URL: productionGatewayWsUrl,
      VITE_WS_URL: productionGatewayWsUrl,
      VITE_BACKEND_DEFAULT: "gateway",
      // Orchestrator runs from arbitrary branches; underlying script
      // requires `main`. This orchestrator is the sanctioned prod path.
      ALLOW_NON_MAIN_PROD_DEPLOY: "1"
    }
  });

  log(
    `Production release complete. https://${productionClientAlias}/__build_sha.txt should now report ${targetSha}. Release tag: ${releaseTag}.`
  );
};

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
