import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Colour emoji in the UI read as generated UI and clash with the HUD's own
// icon art. Icons come from the SVG sets (public/icons, building art) or from
// plain text symbols, with U+FE0E where a symbol would otherwise draw as emoji.
const SRC = fileURLToPath(new URL("..", import.meta.url));

// Resource glyphs are tokens swapped for the SVG resource icons, and release
// notes are player-written prose, so both may keep their characters.
const ALLOWED = new Set(["client-resource-icons/client-resource-icons.ts"]);
const SKIPPED_DIRS = new Set(["client-changelog"]);

const COLOR_EMOJI = /\p{Emoji_Presentation}|[\u{1F000}-\u{1FFFF}]|\p{Emoji}️/u;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return /\.(ts|css|html)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });

describe("no colour emoji in UI source", () => {
  it("draws icons from the icon sets or text symbols, not colour emoji", () => {
    const hits: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const file = relative(SRC, path);
      if (ALLOWED.has(file)) continue;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          // U+FE0E after a symbol forces its text form, so it is not a colour emoji.
          if (COLOR_EMOJI.test(line.replace(/.\\uFE0E/gu, ""))) hits.push(`${file}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
