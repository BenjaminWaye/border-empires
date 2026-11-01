import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildOutreachLink, formatSourceReport, parseChangelogEntries, slugify } from "./outreach-lib.mjs";

test("slugify makes short readable utm values", () => {
  assert.equal(slugify("r/WebGames — Season 12 Launch!"), "rwebgames-season-12-launch");
  assert.equal(slugify("  "), "");
});

test("buildOutreachLink tags the play URL and requires source + campaign", () => {
  const url = new URL(buildOutreachLink({ source: "Reddit", campaign: "r-webgames play" }));
  assert.equal(url.origin, "https://play.borderempires.com");
  assert.equal(url.searchParams.get("utm_source"), "reddit");
  assert.equal(url.searchParams.get("utm_medium"), "post");
  assert.equal(url.searchParams.get("utm_campaign"), "r-webgames-play");
  assert.throws(() => buildOutreachLink({ source: "reddit", campaign: "" }), /campaign/);
  assert.throws(() => buildOutreachLink({ campaign: "x" }), /source/);
});

test("formatSourceReport renders a ranked table with totals", () => {
  const report = formatSourceReport({
    windowDays: 7,
    acquisition: {
      visitors: 12, signUps: 3,
      sources: [
        { source: "reddit", campaign: "r-webgames-play", visitors: 10, signUps: 3 },
        { source: "direct", campaign: undefined, visitors: 2, signUps: 0 }
      ]
    }
  });
  assert.match(report, /last 7 days/);
  assert.match(report, /reddit \/ r-webgames-play\s+10\s+3\s+30%/);
  assert.match(report, /Total: 12 visitors, 3 sign-ups \(25%\)/);
  assert.match(formatSourceReport({ windowDays: 1, acquisition: { sources: [] } }), /No tracked visits/);
});

test("parseChangelogEntries reads entries, including escaped quotes", () => {
  const entries = parseChangelogEntries(`[{
    createdAt: 1793482286154,
    introducedIn: "2026.10.31",
    title: "Offers wait for the \\"map\\"",
    why: "Offers popped up early.",
    changes: ["x"]
  }]`);
  assert.deepEqual(entries, [{ createdAt: 1793482286154, title: 'Offers wait for the "map"', why: "Offers popped up early." }]);
});

test("parseChangelogEntries still finds the real changelog entries (format drift guard)", async () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../packages/client/src/client-changelog");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  let total = 0;
  for (const f of files) total += parseChangelogEntries(await readFile(join(dir, f), "utf8")).length;
  assert.ok(total >= 20, `expected at least 20 parsed changelog entries, got ${total}`);
});
