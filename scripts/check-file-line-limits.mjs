#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const MAX_LINES = Number.parseInt(process.env.FILE_LINE_LIMIT_MAX ?? "500", 10);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue"
]);
const IGNORED_PATH_PARTS = new Set([
  ".git",
  ".codex-worktrees",
  "coverage",
  "dist",
  "build",
  "node_modules"
]);

const git = (args, options = {}) => execFileSync("git", args, { encoding: "utf8", ...options }).trim();

const pathIsIgnored = (filePath) => filePath.split("/").some((part) => IGNORED_PATH_PARTS.has(part));
const isSourceFile = (filePath) => SOURCE_EXTENSIONS.has(extname(filePath)) && !pathIsIgnored(filePath);
const countLines = (text) => text.length === 0 ? 0 : text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);

const resolveBaseRef = () => {
  if (process.env.FILE_LINE_LIMIT_BASE_REF) return process.env.FILE_LINE_LIMIT_BASE_REF;
  try {
    const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    if (upstream) return git(["merge-base", "HEAD", upstream]);
  } catch {
    // Fall back below.
  }
  try {
    return git(["merge-base", "HEAD", "origin/main"]);
  } catch {
    return git(["rev-parse", "HEAD"]);
  }
};

const readBaseFile = (baseRef, filePath) => {
  try {
    return execFileSync("git", ["show", `${baseRef}:${filePath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
};

const parseChangedFiles = (baseRef) => {
  const output = git(["diff", "--name-status", "-M", "--diff-filter=ACMRT", baseRef, "--"]);
  const trackedFiles = output ? output.split("\n")
    .map((line) => line.split("\t"))
    .map((parts) => parts[0]?.startsWith("R")
      ? { filePath: parts[2], basePath: parts[1] }
      : { filePath: parts[1], basePath: parts[1] })
    .filter((entry) => entry.filePath)
    .filter((entry) => isSourceFile(entry.filePath)) : [];
  const untrackedOutput = git(["ls-files", "--others", "--exclude-standard"]);
  const untrackedFiles = untrackedOutput
    ? untrackedOutput.split("\n")
      .filter(isSourceFile)
      .map((filePath) => ({ filePath, basePath: filePath }))
    : [];
  return [...new Map([...trackedFiles, ...untrackedFiles].map((entry) => [entry.filePath, entry])).values()];
};

const baseRef = resolveBaseRef();
const changedFiles = parseChangedFiles(baseRef);
const failures = [];

for (const { filePath, basePath } of changedFiles) {
  if (!existsSync(filePath)) continue;
  const currentLines = countLines(readFileSync(filePath, "utf8"));
  const baseText = readBaseFile(baseRef, basePath);
  const baseLines = baseText === undefined ? undefined : countLines(baseText);

  if (baseLines === undefined) {
    if (currentLines > MAX_LINES) {
      failures.push(`${filePath}: new source file has ${currentLines} lines; max is ${MAX_LINES}. Split it before merging.`);
    }
    continue;
  }

  if (baseLines > MAX_LINES && currentLines > baseLines) {
    failures.push(`${filePath}: already over ${MAX_LINES} lines (${baseLines}) and grew to ${currentLines}. Do not add to oversized files; extract first.`);
    continue;
  }

  if (baseLines <= MAX_LINES && currentLines > MAX_LINES) {
    failures.push(`${filePath}: grew from ${baseLines} to ${currentLines} lines, crossing the ${MAX_LINES}-line cap. Split it before merging.`);
  }
}

if (failures.length > 0) {
  console.error(`File line-limit check failed against ${baseRef}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`File line-limit check passed (${changedFiles.length} changed source files checked, max ${MAX_LINES} lines).`);
