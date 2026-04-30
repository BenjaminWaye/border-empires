import { request as httpsRequest } from "node:https";
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

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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

const jsAssetUrlsFromText = (text, baseUrl) =>
  [...text.matchAll(/(?:\/assets\/|assets\/)[A-Za-z0-9._-]+\.js/g)].map((match) => new URL(match[0], baseUrl).toString());

const bundleIncludesText = async (rootUrl, expected) => {
  const queue = [rootUrl];
  const seen = new Set();
  let inspectedJsFiles = 0;

  while (queue.length > 0 && inspectedJsFiles < 12) {
    const currentUrl = queue.shift();
    if (!currentUrl || seen.has(currentUrl)) continue;
    seen.add(currentUrl);

    const body = await fetchText(currentUrl);
    if (body.includes(expected)) return true;

    if (currentUrl.endsWith(".js") || currentUrl === rootUrl) {
      for (const assetUrl of jsAssetUrlsFromText(body, currentUrl)) {
        if (!seen.has(assetUrl)) queue.push(assetUrl);
      }
    }
    if (currentUrl.endsWith(".js")) inspectedJsFiles += 1;
  }

  return false;
};

const verifyPreviewServesClient = async (deploymentUrl) => {
  run("npx", ["vercel", "inspect", deploymentUrl]);
  console.log(`Preview deployment is READY: ${deploymentUrl}`);
  const servesExpectedGateway = await bundleIncludesText(deploymentUrl, stagingGatewayWsUrl);
  if (!servesExpectedGateway) {
    throw new Error(`Preview deployment does not reference expected staging gateway URL: ${stagingGatewayWsUrl}`);
  }
};

const aliasDeployment = (deploymentUrl, aliasHost) => {
  const normalized = deploymentUrl.endsWith("/") ? deploymentUrl.slice(0, -1) : deploymentUrl;
  run("npx", ["vercel", "alias", "set", normalized, aliasHost]);
  console.log(`Staging alias updated: https://${aliasHost}/`);
};

const verifyAliasServesStagingGateway = async (aliasHost) => {
  const aliasUrl = `https://${aliasHost}/`;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    if (await bundleIncludesText(aliasUrl, stagingGatewayWsUrl)) {
      console.log(`Staging alias serving expected gateway after ${attempt} check(s): ${aliasUrl}`);
      return;
    }
    await sleep(5_000);
  }
  throw new Error(`Staging alias did not reference expected gateway URL within timeout: ${aliasUrl}`);
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
  await verifyAliasServesStagingGateway(stagingAlias);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Preview deployed but staging alias update failed. Ensure DNS record exists: A ${stagingAlias} 76.76.21.21. Original error: ${message}`
  );
}
console.log("Preview release complete. Validate staging behavior before promoting to production.");
