import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import {
  ensureTrackedProjectLink,
  inspectDeployment,
  normalizeDeploymentUrl,
  vercelClientEnv,
  vercelClientProject
} from "./vercel-deploy-guards.mjs";

const rootDir = new URL("../", import.meta.url);
const previewGatewayWsUrl = process.env.PREVIEW_GATEWAY_WS_URL ?? process.env.STAGING_GATEWAY_WS_URL ?? "wss://border-empires-gateway-staging.fly.dev/ws";

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
  const inspected = inspectDeployment(run, deploymentUrl);
  if (inspected.target !== "preview") {
    throw new Error(`Expected preview deployment, got ${inspected.target ?? "unknown"} for ${deploymentUrl}`);
  }
  console.log(`Preview deployment is READY: ${deploymentUrl}`);
  const servesExpectedGateway = await bundleIncludesText(deploymentUrl, previewGatewayWsUrl);
  if (!servesExpectedGateway) {
    throw new Error(`Preview deployment does not reference expected preview gateway URL: ${previewGatewayWsUrl}`);
  }
};
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
      "--archive=tgz",
      "--scope",
      vercelClientProject.scope,
      "--build-env",
      `VITE_GATEWAY_WS_URL=${previewGatewayWsUrl}`,
      "--build-env",
      `VITE_WS_URL=${previewGatewayWsUrl}`
    ],
    { env: vercelClientEnv() }
  )
);
console.log(`Preview deployment URL: ${deploymentUrl}`);
await verifyPreviewServesClient(deploymentUrl);
console.log("Preview release complete. Use the deployment URL for ad hoc validation.");
