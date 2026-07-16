#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const changelogPath = "packages/client/src/client-changelog/client-changelog.ts";
// Release entry data (including the version string checked below) lives in
// client-changelog-data.ts, split out from client-changelog.ts to keep that
// file under the repo's 500-line cap. Either file counts as "the changelog
// was updated" for the presence check, but the version bump is always read
// from the data file since that's where `version:` actually lives now.
const changelogDataPath = "packages/client/src/client-changelog/client-changelog-data.ts";
const relevantRoots = ["packages/client/src/", "packages/shared/src/"];

const runGit = (args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();

const optionalGit = (args) => {
  try {
    return runGit(args);
  } catch {
    return "";
  }
};

const listFiles = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const baseRef = optionalGit(["rev-parse", "--verify", "origin/main"])
  ? "origin/main"
  : optionalGit(["rev-parse", "--verify", "main"])
    ? "main"
    : "";

const mergeBase = baseRef ? optionalGit(["merge-base", "HEAD", baseRef]) : "";
const branchDiffFiles = mergeBase ? listFiles(optionalGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}..HEAD`])) : [];
const workingTreeFiles = listFiles(optionalGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]));
const untrackedFiles = listFiles(optionalGit(["ls-files", "--others", "--exclude-standard"]));

const changedFiles = new Set([...branchDiffFiles, ...workingTreeFiles, ...untrackedFiles]);

const isRelevantChange = (path) =>
  relevantRoots.some((root) => path.startsWith(root)) &&
  !path.endsWith(".test.ts") &&
  !path.endsWith(".spec.ts") &&
  path !== changelogPath &&
  path !== changelogDataPath;

const relevantChanges = [...changedFiles].filter(isRelevantChange);
if (relevantChanges.length === 0) process.exit(0);

if (!changedFiles.has(changelogPath) && !changedFiles.has(changelogDataPath)) {
  console.error("Client changelog check failed.");
  console.error(`Relevant product code changed without updating ${changelogDataPath}.`);
  console.error("Changed files:");
  for (const file of relevantChanges) console.error(`- ${file}`);
  process.exit(1);
}

const extractVersion = (source) => {
  const match = source.match(/version:\s*"([^"]+)"/);
  if (!match) throw new Error("Could not find changelog release version.");
  return match[1];
};

const currentSource = readFileSync(resolve(repoRoot, changelogDataPath), "utf8");
const currentVersion = extractVersion(currentSource);
const previousSource = mergeBase ? optionalGit(["show", `${mergeBase}:${changelogDataPath}`]) : "";
const previousVersion = previousSource ? extractVersion(previousSource) : "";

if (previousVersion && currentVersion === previousVersion) {
  console.error("Client changelog check failed.");
  console.error(`${changelogDataPath} changed, but the release version was not bumped.`);
  console.error(`Current release version: ${currentVersion}`);
  process.exit(1);
}
