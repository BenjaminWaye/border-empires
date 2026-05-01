import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";

export const vercelClientProject = {
  projectName: "border-empires-client",
  projectId: "prj_QczQjhdpgV6Mu8Q03r4Ot6KWD1va",
  orgId: "team_GdmtYDKeSISxfvppIgLt4Rma",
  scope: "benjaminwayes-projects",
  productionAliasHost: "play.borderempires.com",
  stagingAliasHost: "staging.borderempires.com",
  stableProductionAliasHost: "border-empires-client.vercel.app",
  productionBranch: "main",
  stagingBranch: "staging"
};

const trackedProjectLink = {
  projectId: vercelClientProject.projectId,
  orgId: vercelClientProject.orgId,
  projectName: vercelClientProject.projectName
};

export const vercelClientEnv = (env = process.env) => ({
  ...env,
  VERCEL_ORG_ID: vercelClientProject.orgId,
  VERCEL_PROJECT_ID: vercelClientProject.projectId
});

const vercelAuthFileCandidates = (env = process.env) => {
  const candidates = [];
  if (env.HOME) {
    candidates.push(join(env.HOME, "Library", "Application Support", "com.vercel.cli", "auth.json"));
    candidates.push(join(env.HOME, ".config", "com.vercel.cli", "auth.json"));
    candidates.push(join(env.HOME, ".vercel", "auth.json"));
  }
  if (env.XDG_CONFIG_HOME) candidates.push(join(env.XDG_CONFIG_HOME, "com.vercel.cli", "auth.json"));
  if (env.APPDATA) candidates.push(join(env.APPDATA, "com.vercel.cli", "auth.json"));
  return [...new Set(candidates)];
};

export const loadVercelApiToken = (env = process.env) => {
  const tokenFromEnv = env.VERCEL_TOKEN ?? env.VERCEL_ACCESS_TOKEN ?? env.VERCEL_API_TOKEN;
  if (tokenFromEnv) return tokenFromEnv;

  for (const candidate of vercelAuthFileCandidates(env)) {
    if (!existsSync(candidate)) continue;
    try {
      const auth = JSON.parse(readFileSync(candidate, "utf8"));
      if (typeof auth?.token === "string" && auth.token.length > 0) return auth.token;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Unable to load a Vercel API token. Set VERCEL_TOKEN or authenticate with the Vercel CLI on this machine."
  );
};

export const normalizeDeploymentUrl = (value) => {
  const normalizedValue = value.replace(/\u001b\[[0-9;]*m/g, "");
  const matches = [...normalizedValue.matchAll(/https:\/\/[^\s]+\.vercel\.app\/?/g)].map((match) => match[0]);
  const preferred =
    matches.find((url) => url.includes("border-empires-client-") && !url.includes("border-empires-client.vercel.app")) ??
    matches.find((url) => !url.includes("border-empires-client.vercel.app")) ??
    matches.at(-1);
  if (!preferred) throw new Error("Vercel output did not include a deployment URL");
  return preferred.endsWith("/") ? preferred : `${preferred}/`;
};

export const parseVercelInspectOutput = (output) => {
  const lines = output.split(/\r?\n/);
  let target;
  const deploymentUrl = normalizeDeploymentUrl(output);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("target")) {
      target = trimmed.split(/\s+/).at(-1);
      continue;
    }
  }
  return {
    target,
    deploymentUrl
  };
};

export const inspectDeployment = (run, deploymentRef) => {
  const output = run(
    "npx",
    ["vercel", "inspect", deploymentRef, "--scope", vercelClientProject.scope, "--no-color"],
    { returnCombinedOutput: true }
  );
  return parseVercelInspectOutput(output);
};

export const assertProjectDomainBranchBinding = ({ domains, domainName, expectedGitBranch }) => {
  const domain = domains.find((entry) => entry?.name === domainName);
  if (!domain) throw new Error(`Project domain ${domainName} is not attached to ${vercelClientProject.projectName}`);

  const actualGitBranch = domain.gitBranch ?? null;
  const normalizedExpected = expectedGitBranch ?? null;
  if (actualGitBranch !== normalizedExpected) {
    const actualLabel = actualGitBranch ?? "production/default";
    const expectedLabel = normalizedExpected ?? "production/default";
    throw new Error(`Project domain ${domainName} is bound to ${actualLabel}, expected ${expectedLabel}`);
  }
  return domain;
};

export const fetchProjectDomains = async ({ authToken, projectId = vercelClientProject.projectId, teamId = vercelClientProject.orgId }) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      `https://api.vercel.com/v9/projects/${projectId}/domains?teamId=${teamId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      },
      (res) => {
        const chunks = [];
        res.setEncoding("utf8");
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = chunks.join("");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Failed to fetch Vercel project domains: ${res.statusCode} ${body.slice(0, 200)}`));
            return;
          }
          try {
            const parsed = JSON.parse(body);
            resolve(Array.isArray(parsed?.domains) ? parsed.domains : []);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });

export const verifyProjectDomainBranchBinding = async ({ domainName, expectedGitBranch, env = process.env }) => {
  const authToken = loadVercelApiToken(env);
  const domains = await fetchProjectDomains({ authToken });
  return assertProjectDomainBranchBinding({ domains, domainName, expectedGitBranch });
};

export const assertAliasMatchesDeployment = ({ run, aliasHost, expectedDeploymentUrl, expectedTarget }) => {
  const inspected = inspectDeployment(run, `https://${aliasHost}`);
  if (inspected.deploymentUrl !== expectedDeploymentUrl) {
    throw new Error(
      `Expected ${aliasHost} to resolve to ${expectedDeploymentUrl}, but it resolved to ${inspected.deploymentUrl}`
    );
  }
  if (expectedTarget && inspected.target !== expectedTarget) {
    throw new Error(`Expected ${aliasHost} to resolve to a ${expectedTarget} deployment, got ${inspected.target ?? "unknown"}`);
  }
  return inspected;
};

export const assertAliasDoesNotResolveToDeployment = ({ run, aliasHost, unexpectedDeploymentUrl, unexpectedTarget }) => {
  const inspected = inspectDeployment(run, `https://${aliasHost}`);
  if (inspected.deploymentUrl === unexpectedDeploymentUrl) {
    throw new Error(`${aliasHost} unexpectedly resolved to ${unexpectedDeploymentUrl}`);
  }
  if (unexpectedTarget && inspected.target === unexpectedTarget) {
    throw new Error(`${aliasHost} unexpectedly resolved to a ${unexpectedTarget} deployment`);
  }
};

export const assertRequiredBranch = ({ run, requiredBranch, overrideEnvVar, label }) => {
  const branch = run("git", ["branch", "--show-current"]).trim();
  if (branch === requiredBranch) return branch;
  if (process.env[overrideEnvVar] === "1") return branch;
  throw new Error(
    `${label} must run from branch ${requiredBranch}. Current branch is ${branch || "(detached HEAD)"}. ` +
    `If you truly need to bypass this, set ${overrideEnvVar}=1 for that command only.`
  );
};

export const ensureTrackedProjectLink = (rootDirUrl) => {
  const rootDir = new URL("./", rootDirUrl);
  const projectDirUrl = new URL(".vercel/", rootDir);
  const projectJsonUrl = new URL("project.json", projectDirUrl);
  mkdirSync(projectDirUrl, { recursive: true });

  let current;
  try {
    current = JSON.parse(readFileSync(projectJsonUrl, "utf8"));
  } catch {
    current = undefined;
  }

  if (
    current?.projectId === trackedProjectLink.projectId &&
    current?.orgId === trackedProjectLink.orgId &&
    current?.projectName === trackedProjectLink.projectName
  ) {
    return projectJsonUrl;
  }

  writeFileSync(projectJsonUrl, `${JSON.stringify(trackedProjectLink, null, 2)}\n`, "utf8");
  return projectJsonUrl;
};
