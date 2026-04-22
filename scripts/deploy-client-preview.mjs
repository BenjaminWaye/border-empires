import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url);
const stagingAlias = process.env.STAGING_CLIENT_ALIAS ?? "staging.borderempires.com";
const stagingGatewayWsUrl = process.env.STAGING_GATEWAY_WS_URL ?? "wss://border-empires-gateway-staging.fly.dev/ws";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
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

const normalizeDeploymentUrl = (value) => {
  const matches = [...value.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.vercel\.app\/?/g)].map((match) => match[0]);
  const preferred =
    matches.find((url) => url.includes("border-empires-client-") && !url.includes("border-empires-client.vercel.app")) ??
    matches.find((url) => !url.includes("border-empires-client.vercel.app")) ??
    matches.at(-1);
  if (!preferred) throw new Error("Vercel preview deploy did not return a deployment URL");
  return preferred.endsWith("/") ? preferred : `${preferred}/`;
};

const verifyPreviewServesClient = async (deploymentUrl) => {
  run("npx", ["vercel", "inspect", deploymentUrl]);
  console.log(`Preview deployment is READY: ${deploymentUrl}`);
};

const aliasDeployment = (deploymentUrl, aliasHost) => {
  const normalized = deploymentUrl.endsWith("/") ? deploymentUrl.slice(0, -1) : deploymentUrl;
  run("npx", ["vercel", "alias", "set", normalized, aliasHost]);
  console.log(`Staging alias updated: https://${aliasHost}/`);
};

run("pnpm", ["--filter", "@border-empires/shared", "build"]);
run("pnpm", ["--filter", "@border-empires/client", "build"]);
const deploymentUrl = normalizeDeploymentUrl(
  run("npx", [
    "vercel",
    "deploy",
    "--yes",
    "--build-env",
    `VITE_GATEWAY_WS_URL=${stagingGatewayWsUrl}`,
    "--build-env",
    `VITE_WS_URL=${stagingGatewayWsUrl}`
  ])
);
console.log(`Preview deployment URL: ${deploymentUrl}`);
await verifyPreviewServesClient(deploymentUrl);
try {
  aliasDeployment(deploymentUrl, stagingAlias);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Preview deployed but staging alias update failed. Ensure DNS record exists: A ${stagingAlias} 76.76.21.21. Original error: ${message}`
  );
}
console.log("Preview release complete. Validate staging behavior before promoting to production.");
