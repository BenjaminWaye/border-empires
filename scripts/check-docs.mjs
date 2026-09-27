import { existsSync, readFileSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const trackedMarkdown = execFileSync("git", ["ls-files", "*.md"], { cwd: repoRoot, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const errors = [];
const isLocalTarget = (target) => target && !target.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("//");

for (const file of trackedMarkdown) {
  if (!file.startsWith("docs/")) continue;
  const source = readFileSync(resolve(repoRoot, file), "utf8");
  const header = source.split("\n", 12).join("\n");
  const archived = file.startsWith("docs/archive/") && file !== "docs/archive/README.md";
  if (file.startsWith("docs/") && !archived && !/^Status:/m.test(header)) {
    errors.push(`${file}: missing Status: line near the top`);
  }
  if (archived && !/^Status: historical record/m.test(header)) {
    errors.push(`${file}: missing historical-record marker near the top`);
  }
  if (archived) continue;
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
    if (!isLocalTarget(target)) continue;
    const path = normalize(resolve(dirname(resolve(repoRoot, file)), target));
    if (!path.startsWith(`${repoRoot}/`) || !existsSync(path)) {
      errors.push(`${file}: unresolved local link ${match[1]}`);
      continue;
    }
  }
}

if (errors.length > 0) {
  console.error(`Documentation check failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Documentation check passed (${trackedMarkdown.length} tracked Markdown files).`);
