// Keeps Storybook organised: every story sits in the folder its sidebar title
// names, renders shipped client code (or says why not), and nothing imports a
// missing file. See packages/storybook/README.md for the layout.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_SRC = resolve(SRC, "../../client/src");

const ROOTS = ["Map", "UI", "Assets", "History", "Sandbox"] as const;
// Folders whose stories must render code imported from the client.
const SHIPPED_CODE_FOLDERS = ["map", "ui"];
const SANDBOX_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const sourceFiles = walk(SRC).filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
const storyFiles = sourceFiles.filter((path) => path.endsWith(".stories.ts"));

const rel = (path: string): string => relative(SRC, path);
const importsOf = (source: string): string[] => [...source.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1]!);
const metaTitle = (source: string): string | undefined => {
  const meta = source.indexOf("const meta");
  return meta < 0 ? undefined : /title:\s*"([^"]+)"/.exec(source.slice(meta))?.[1];
};
const squash = (segment: string): string => segment.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("storybook structure", () => {
  it("files every story under a known root, in the folder its title names", () => {
    const problems = storyFiles.flatMap((path) => {
      const title = metaTitle(readFileSync(path, "utf8"));
      if (!title) return [`${rel(path)}: no \`const meta\` title`];
      const segments = title.split("/");
      if (!(ROOTS as readonly string[]).includes(segments[0]!)) return [`${rel(path)}: title root "${segments[0]}" is not one of ${ROOTS.join(", ")}`];
      const folders = dirname(rel(path)).split("/");
      const mismatch = folders.findIndex((folder, i) => !squash(segments[i] ?? "").startsWith(squash(folder)));
      return mismatch < 0 ? [] : [`${rel(path)}: folder "${folders.join("/")}" does not match title "${title}"`];
    });
    expect(problems).toEqual([]);
  });

  it("never imports from another story file", () => {
    const problems = sourceFiles.flatMap((path) =>
      importsOf(readFileSync(path, "utf8"))
        .filter((spec) => spec.startsWith(".") && /\.stories(\.js)?$/.test(spec))
        .map((spec) => `${rel(path)} imports ${spec}; move shared helpers into fixtures/`)
    );
    expect(problems).toEqual([]);
  });

  it("only imports files that exist", () => {
    const problems = sourceFiles.flatMap((path) =>
      importsOf(readFileSync(path, "utf8")).flatMap((spec) => {
        let target: string;
        if (spec.startsWith("@client/")) target = join(CLIENT_SRC, spec.slice("@client/".length));
        else if (spec.startsWith(".")) target = resolve(dirname(path), spec);
        else return [];
        const candidates = [target, target.replace(/\.js$/, ".ts")];
        return candidates.some((candidate) => existsSync(candidate)) ? [] : [`${rel(path)} imports missing ${spec}`];
      })
    );
    expect(problems).toEqual([]);
  });

  it("renders shipped client code in every Map and UI story", () => {
    const importsClient = (path: string): boolean =>
      importsOf(readFileSync(path, "utf8")).some((spec) => spec.startsWith("@client/") || spec.startsWith("@border-empires/"));
    // A story may reach the client through one of its fixtures.
    const reachesClient = (path: string): boolean =>
      importsClient(path) ||
      importsOf(readFileSync(path, "utf8"))
        .filter((spec) => spec.startsWith("."))
        .map((spec) => resolve(dirname(path), spec).replace(/\.js$/, ".ts"))
        .some((target) => rel(target).startsWith("fixtures/") && existsSync(target) && importsClient(target));
    const problems = storyFiles
      .filter((path) => SHIPPED_CODE_FOLDERS.includes(rel(path).split("/")[0]!))
      .filter((path) => !reachesClient(path))
      .map((path) => `${rel(path)} renders no client code; hand-built prototypes belong in sandbox/`);
    expect(problems).toEqual([]);
  });

  it(`gives every sandbox story an owner and retires it within ${SANDBOX_MAX_AGE_DAYS} days`, () => {
    const problems = storyFiles
      .filter((path) => rel(path).startsWith("sandbox/"))
      .flatMap((path) => {
        const match = /sandbox:\s*\{\s*owner:\s*"([^"]+)",\s*added:\s*"(\d{4}-\d{2}-\d{2})"/.exec(readFileSync(path, "utf8"));
        if (!match) return [`${rel(path)}: add parameters.sandbox = { owner: "<github login>", added: "YYYY-MM-DD" }`];
        const ageDays = Math.floor((Date.now() - Date.parse(match[2]!)) / DAY_MS);
        return ageDays > SANDBOX_MAX_AGE_DAYS
          ? [`${rel(path)}: sandbox story added ${match[2]} by ${match[1]} is ${ageDays} days old; promote it into ui/ or map/, or delete it`]
          : [];
      });
    expect(problems).toEqual([]);
  });
});
