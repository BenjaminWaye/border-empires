import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url);
const stableAlias = "https://border-empires-client.vercel.app/";
const vercelProjectPath = new URL("../.vercel/project.json", import.meta.url);

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
  if (!preferred) throw new Error("Vercel deploy did not return a deployment URL");
  return preferred.endsWith("/") ? preferred : `${preferred}/`;
};

const verifyAliasMatchesDeployment = async (deploymentUrl) => {
  const deploymentHtml = await fetchText(deploymentUrl);
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const aliasHtml = await fetchText(stableAlias);
    if (aliasHtml === deploymentHtml) {
      console.log(`Stable alias updated after ${attempt} check(s): ${stableAlias}`);
      return;
    }
    await sleep(5_000);
  }
  throw new Error(`Stable alias did not match deployed HTML within timeout: ${stableAlias}`);
};

const project = JSON.parse(readFileSync(vercelProjectPath, "utf8"));
if (project.projectName !== "border-empires-client") {
  throw new Error(`Unexpected Vercel project: ${project.projectName}`);
}

run("pnpm", ["--filter", "@border-empires/shared", "build"]);
run("pnpm", ["--filter", "@border-empires/client", "build"]);
const deploymentUrl = normalizeDeploymentUrl(run("npx", ["vercel", "deploy", "--prod", "--yes"]));
console.log(`Deployment URL: ${deploymentUrl}`);
await verifyAliasMatchesDeployment(deploymentUrl);
