import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertDeploymentDoesNotClaimAlias,
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
    deploymentUrl: "https://border-empires-client-cd6keu06l-benjaminwayes-projects.vercel.app/",
    aliases: [
      "play.borderempires.com",
      "staging.borderempires.com",
      "border-empires-client.vercel.app"
    ]
  });
});

test("parseVercelInspectOutput keeps nested alias lines under the same deployment", () => {
  const output = `
Fetching deployment "play.borderempires.com" in benjaminwayes-projects
> Fetched deployment "border-empires-client-js86k7eof-benjaminwayes-projects.vercel.app" in benjaminwayes-projects [873ms]

General

id		dpl_DHVPmsMP3Bka5feqwpoSZWAvRjRV
name	border-empires-client
target	production
status	● Ready
url		https://border-empires-client-js86k7eof-benjaminwayes-projects.vercel.app
created	Fri May 01 2026 00:47:48 GMT+0700 (Indochina Time) [37m ago]


Aliases

╶ https://play.borderempires.com
    ╶ https://staging.borderempires.com
    ╶ https://border-empires-client.vercel.app
    ╶ https://border-empires-client-benjaminwayes-projects.vercel.app


Builds

╶ .        [0ms]
`;
  assert.deepEqual(parseVercelInspectOutput(output), {
    target: "production",
    deploymentUrl: "https://border-empires-client-js86k7eof-benjaminwayes-projects.vercel.app/",
    aliases: [
      "play.borderempires.com",
      "staging.borderempires.com",
      "border-empires-client.vercel.app",
      "border-empires-client-benjaminwayes-projects.vercel.app"
    ]
  });
});

test("assertDeploymentDoesNotClaimAlias fails when the inspected deployment still owns the alias", () => {
  assert.throws(
    () =>
      assertDeploymentDoesNotClaimAlias({
        run: () => `
Fetching deployment "play.borderempires.com" in benjaminwayes-projects
> Fetched deployment "border-empires-client-js86k7eof-benjaminwayes-projects.vercel.app" in benjaminwayes-projects [873ms]

General

target	production
url		https://border-empires-client-js86k7eof-benjaminwayes-projects.vercel.app

Aliases

╶ https://play.borderempires.com
    ╶ https://staging.borderempires.com
`,
        deploymentRef: "https://play.borderempires.com",
        aliasHost: "staging.borderempires.com"
      }),
    /unexpectedly claims alias staging\.borderempires\.com/
  );
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
