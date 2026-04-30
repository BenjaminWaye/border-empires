import { ensureTrackedProjectLink, vercelClientProject } from "./vercel-deploy-guards.mjs";

const rootDir = new URL("../", import.meta.url);
const projectJsonUrl = ensureTrackedProjectLink(rootDir);

console.log(`Pinned Vercel project link written to ${projectJsonUrl.pathname}`);
console.log(
  `Project ${vercelClientProject.projectName} (${vercelClientProject.projectId}) under ${vercelClientProject.scope}`
);
