import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import {
  assertAliasDoesNotResolveToDeployment,
  assertRequiredBranch,
  assertAliasMatchesDeployment,
  ensureTrackedProjectLink,
  inspectDeployment,
  normalizeDeploymentUrl,
  verifyProjectDomainBranchBinding,
  vercelClientEnv,
  vercelClientProject
} from "./vercel-deploy-guards.mjs";

const rootDir = new URL("../", import.meta.url);
const stableAlias = `https://${vercelClientProject.stableProductionAliasHost}/`;
const vercelProjectPath = new URL("../.vercel/project.json", import.meta.url);
const productionAlias = process.env.PRODUCTION_CLIENT_ALIAS ?? vercelClientProject.productionAliasHost;
const stagingAlias = process.env.STAGING_CLIENT_ALIAS ?? vercelClientProject.stagingAliasHost;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return (options.returnCombinedOutput ? `${result.stdout}${result.stderr}` : result.stdout).trim();
};

const fetchText = (url) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache"
        }
      },
      (res) => {
        const chunks = [];
        res.setEncoding("utf8");
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = chunks.join("");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`GET ${url} returned ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          resolve(body);
        });
      }
    );
    req.on("error", reject);
    req.end();
  });

const verifyStableAliasIsServing = async () => {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const aliasHtml = await fetchText(stableAlias);
    if (aliasHtml.includes("<canvas id=\"game\"></canvas>")) {
      console.log(`Stable alias serving client app after ${attempt} check(s): ${stableAlias}`);
      return;
    }
    await sleep(5_000);
  }
  throw new Error(`Stable alias did not serve the client app within timeout: ${stableAlias}`);
};

assertRequiredBranch({
  run,
  requiredBranch: vercelClientProject.productionBranch,
  overrideEnvVar: "ALLOW_NON_MAIN_PROD_DEPLOY",
  label: "Production client deploy"
});
await verifyProjectDomainBranchBinding({
  domainName: stagingAlias,
  expectedGitBranch: vercelClientProject.stagingBranch
});
ensureTrackedProjectLink(rootDir);
const project = JSON.parse(readFileSync(vercelProjectPath, "utf8"));
if (project.projectName !== vercelClientProject.projectName) {
  throw new Error(`Unexpected Vercel project: ${project.projectName}`);
}

run("pnpm", ["--filter", "@border-empires/shared", "build"]);
run("pnpm", ["--filter", "@border-empires/client", "build"]);
const deploymentUrl = normalizeDeploymentUrl(
  run(
    "npx",
    [
      "vercel",
      "deploy",
      "--prod",
      "--yes",
      "--scope",
      vercelClientProject.scope
    ],
    { env: vercelClientEnv() }
  )
);
console.log(`Deployment URL: ${deploymentUrl}`);
const inspected = inspectDeployment(run, deploymentUrl);
if (inspected.target !== "production") {
  throw new Error(`Expected production deployment, got ${inspected.target ?? "unknown"} for ${deploymentUrl}`);
}
await verifyStableAliasIsServing();
assertAliasMatchesDeployment({
  run,
  aliasHost: productionAlias,
  expectedDeploymentUrl: deploymentUrl,
  expectedTarget: "production"
});
assertAliasMatchesDeployment({
  run,
  aliasHost: vercelClientProject.stableProductionAliasHost,
  expectedDeploymentUrl: deploymentUrl,
  expectedTarget: "production"
});
assertAliasDoesNotResolveToDeployment({
  run,
  aliasHost: stagingAlias,
  unexpectedDeploymentUrl: deploymentUrl,
  unexpectedTarget: "production"
});
