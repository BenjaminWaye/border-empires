import { spawnSync } from "node:child_process";
import { request as httpsRequest } from "node:https";

const rootDir = new URL("../", import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const html = await fetchText(deploymentUrl);
    if (html.includes("<canvas id=\"game\"></canvas>")) {
      console.log(`Preview serving client app after ${attempt} check(s): ${deploymentUrl}`);
      return;
    }
    await sleep(5_000);
  }
  throw new Error(`Preview did not serve client app within timeout: ${deploymentUrl}`);
};

run("pnpm", ["--filter", "@border-empires/shared", "build"]);
run("pnpm", ["--filter", "@border-empires/client", "build"]);
const deploymentUrl = normalizeDeploymentUrl(run("npx", ["vercel", "deploy", "--yes"]));
console.log(`Preview deployment URL: ${deploymentUrl}`);
await verifyPreviewServesClient(deploymentUrl);
console.log("Preview release complete. Validate staging behavior before promoting to production.");
