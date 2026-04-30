import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureTrackedProjectLink,
  normalizeDeploymentUrl,
  parseVercelInspectOutput,
  vercelClientProject
} from "./vercel-deploy-guards.mjs";

test("normalizeDeploymentUrl prefers the concrete deployment hostname", () => {
  const output = [
    "https://border-empires-client.vercel.app",
    "https://border-empires-client-cd6keu06l-benjaminwayes-projects.vercel.app"
  ].join("\n");
  assert.equal(
    normalizeDeploymentUrl(output),
    "https://border-empires-client-cd6keu06l-benjaminwayes-projects.vercel.app/"
  );
});

test("parseVercelInspectOutput reads target, deployment url, and aliases", () => {
  const output = `
Fetching deployment "play.borderempires.com" in benjaminwayes-projects
> Fetched deployment "border-empires-client-cd6keu06l-benjaminwayes-projects.vercel.app" in benjaminwayes-projects [538ms]

  General

    id      dpl_618eHQDRSHpptrx48b9xaZkNYfee
    name    border-empires-client
    target  production
    status  ● Ready
    url     https://border-empires-client-cd6keu06l-benjaminwayes-projects.vercel.app

  Aliases

    ╶ https://play.borderempires.com
    ╶ https://staging.borderempires.com
    ╶ https://border-empires-client.vercel.app
`;
  assert.deepEqual(parseVercelInspectOutput(output), {
    target: "production",
    deploymentUrl: "https://border-empires-client-cd6keu06l-benjaminwayes-projects.vercel.app/"
  });
});

test("ensureTrackedProjectLink writes the pinned root project link", () => {
  const rootDir = `${mkdtempSync(join(tmpdir(), "border-empires-vercel-link-"))}/`;
  const writtenUrl = ensureTrackedProjectLink(new URL(`file://${rootDir}`));
  const project = JSON.parse(readFileSync(writtenUrl, "utf8"));

  assert.deepEqual(project, {
    projectId: vercelClientProject.projectId,
    orgId: vercelClientProject.orgId,
    projectName: vercelClientProject.projectName
  });
});
