import { spawnSync } from "node:child_process";
import {
  assertAliasDoesNotResolveToDeployment,
  assertRequiredBranch,
  assertAliasMatchesDeployment,
  ensureTrackedProjectLink,
  inspectDeployment,
  normalizeDeploymentUrl,
  vercelClientEnv,
  vercelClientProject
} from "./vercel-deploy-guards.mjs";

const rootDir = new URL("../", import.meta.url);
const stagingAlias = process.env.STAGING_CLIENT_ALIAS ?? vercelClientProject.stagingAliasHost;
const stagingGatewayWsUrl = process.env.STAGING_GATEWAY_WS_URL ?? "wss://border-empires-gateway-staging.fly.dev/ws";
const productionAlias = process.env.PRODUCTION_CLIENT_ALIAS ?? vercelClientProject.productionAliasHost;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"]
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
  return result.stdout.trim();
};

const verifyPreviewServesClient = async (deploymentUrl) => {
  const inspected = inspectDeployment(run, deploymentUrl);
  if (inspected.target !== "preview") {
    throw new Error(`Expected preview deployment, got ${inspected.target ?? "unknown"} for ${deploymentUrl}`);
  }
  console.log(`Preview deployment is READY: ${deploymentUrl}`);
};

const aliasDeployment = (deploymentUrl, aliasHost) => {
  const normalized = deploymentUrl.endsWith("/") ? deploymentUrl.slice(0, -1) : deploymentUrl;
  run(
    "npx",
    ["vercel", "alias", "set", normalized, aliasHost, "--scope", vercelClientProject.scope],
    { env: vercelClientEnv() }
  );
  console.log(`Staging alias updated: https://${aliasHost}/`);
};

assertRequiredBranch({
  run,
  requiredBranch: vercelClientProject.stagingBranch,
  overrideEnvVar: "ALLOW_NON_STAGING_BRANCH_DEPLOY",
  label: "Staging client deploy"
});
ensureTrackedProjectLink(rootDir);
run("pnpm", ["--filter", "@border-empires/shared", "build"]);
run("pnpm", ["--filter", "@border-empires/client", "build"]);
const deploymentUrl = normalizeDeploymentUrl(
  run(
    "npx",
    [
      "vercel",
      "deploy",
      "--yes",
      "--scope",
      vercelClientProject.scope,
      "--build-env",
      `VITE_GATEWAY_WS_URL=${stagingGatewayWsUrl}`,
      "--build-env",
      `VITE_WS_URL=${stagingGatewayWsUrl}`
    ],
    { env: vercelClientEnv() }
  )
);
console.log(`Preview deployment URL: ${deploymentUrl}`);
await verifyPreviewServesClient(deploymentUrl);
try {
  aliasDeployment(deploymentUrl, stagingAlias);
  assertAliasMatchesDeployment({
    run,
    aliasHost: stagingAlias,
    expectedDeploymentUrl: deploymentUrl,
    expectedTarget: "preview"
  });
  assertAliasDoesNotResolveToDeployment({
    run,
    aliasHost: productionAlias,
    unexpectedDeploymentUrl: deploymentUrl,
    unexpectedTarget: "preview"
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Preview deployed but staging alias update failed. Ensure DNS record exists: A ${stagingAlias} 76.76.21.21. Original error: ${message}`
  );
}
console.log("Staging release complete. Validate staging behavior before promoting to production.");
