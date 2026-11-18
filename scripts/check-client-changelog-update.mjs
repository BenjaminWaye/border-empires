#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const changelogPath = "packages/client/src/client-changelog/client-changelog.ts";
// Release entry data lives in client-changelog-data.ts, split out from
// client-changelog.ts to keep that file under the repo's 500-line cap.
// Entries are timestamped and unordered (no shared version field to bump),
// so the only thing this check enforces is that a new entry with a fresh
// createdAt was actually added, not just that either file was touched.
const changelogDataPath = "packages/client/src/client-changelog/client-changelog-data.ts";
// Entries (and their createdAt literals) also live in sibling files that
// client-changelog-data.ts imports: per-entry files and dated groups such as
// client-changelog-nov-18.ts, split out for the same line cap. Every
// timestamp and createdAt guard below scans the whole directory, so moving
// entries between these files can't hide a new entry or a Date.now().
const changelogDir = "packages/client/src/client-changelog/";
const isChangelogEntrySource = (path) =>
  path.startsWith(changelogDir) && path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.slice(changelogDir.length).includes("/");
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

// createdAt must be a frozen literal, not a live expression like Date.now().
// tsc can't catch this (Date.now() satisfies `createdAt: number` fine), and
// it silently re-stamps the entry to "now" on every module load, so it
// permanently sorts above every real, correctly-dated entry. Runs
// unconditionally (before the "any relevant change at all?" gate below) so
// it can't be skipped just because no other product code changed.
for (const changedPath of [...changedFiles].filter(isChangelogEntrySource)) {
  const source = readFileSync(resolve(repoRoot, changedPath), "utf8");
  // Only checks entry object properties ("createdAt: <value>,"), not the
  // interface field declaration ("createdAt: number;").
  const liveCreatedAtCalls = [...source.matchAll(/createdAt:\s*([^,}\n]+)[,}]/g)]
    .map((match) => match[1].trim())
    .filter((value) => !/^\d+$/.test(value));
  if (liveCreatedAtCalls.length > 0) {
    console.error("Client changelog check failed.");
    console.error(`${changedPath} has non-literal createdAt value(s) — use a frozen Unix-ms number, not Date.now() or any other expression:`);
    for (const call of liveCreatedAtCalls) console.error(`- ${call}`);
    process.exit(1);
  }
}

// The "-earlier*" files hold the same entry data as changelogDataPath,
// split out only to keep changelogDataPath under the repo's line cap (see
// its header comment). Pruning old entries out of them (rolling 6-day
// window) is data cleanup, not a product change needing a new entry, so
// they're excluded from the relevance check the same way changelogDataPath
// itself is.
const isChangelogDataFile = (path) =>
  /^packages\/client\/src\/client-changelog\/client-changelog-(data(-earlier(-\d+)?)?|[a-z]{3}-\d{2})\.ts$/.test(path);

const isRelevantChange = (path) =>
  relevantRoots.some((root) => path.startsWith(root)) &&
  !path.endsWith(".test.ts") &&
  !path.endsWith(".spec.ts") &&
  path !== changelogPath &&
  !isChangelogDataFile(path);

const relevantChanges = [...changedFiles].filter(isRelevantChange);
if (relevantChanges.length === 0) process.exit(0);

if (![...changedFiles].some(isChangelogEntrySource)) {
  console.error("Client changelog check failed.");
  console.error(`Relevant product code changed without updating ${changelogDataPath}.`);
  console.error("Changed files:");
  for (const file of relevantChanges) console.error(`- ${file}`);
  process.exit(1);
}

const extractCreatedAtTimestamps = (source) => new Set([...source.matchAll(/createdAt:\s*(\d+)/g)].map((match) => match[1]));

const currentSource = readdirSync(resolve(repoRoot, changelogDir))
  .map((name) => `${changelogDir}${name}`)
  .filter(isChangelogEntrySource)
  .map((path) => readFileSync(resolve(repoRoot, path), "utf8"))
  .join("\n");
const currentTimestamps = extractCreatedAtTimestamps(currentSource);
const previousSource = mergeBase ? optionalGit(["grep", "-h", "-F", "createdAt:", mergeBase, "--", `${changelogDir}*.ts`]) : "";
const previousTimestamps = previousSource ? extractCreatedAtTimestamps(previousSource) : new Set();

const addedTimestamps = [...currentTimestamps].filter((timestamp) => !previousTimestamps.has(timestamp));

if (previousSource && addedTimestamps.length === 0) {
  console.error("Client changelog check failed.");
  console.error(`${changelogDir} changed, but no new entry (new createdAt timestamp) was added.`);
  process.exit(1);
}
