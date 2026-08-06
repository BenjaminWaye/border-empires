import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { effectSummaryLabel } from "./client-tech-html.js";

const dataPath = (name: string): string =>
  fileURLToPath(new URL(`../../../game-domain/data/${name}`, import.meta.url));
const techTreeData = JSON.parse(readFileSync(dataPath("tech-tree.json"), "utf8"));
const domainTreeData = JSON.parse(readFileSync(dataPath("domain-tree.json"), "utf8"));

// Same bug class as client-tech-payoffs.test.ts: an effect key exists in
// the data but has no case in this file's effectSummaryLabel, so the full
// tech-detail description silently renders a blank line for it instead of
// failing loudly. Every effect key actually present on a tech/domain must
// produce a real label for at least one representative value.
const effectKeysWithSampleValue = (): Array<[string, unknown]> => {
  const entries = [
    ...(techTreeData as { techs: Array<{ effects?: Record<string, unknown> }> }).techs,
    ...(domainTreeData as { domains: Array<{ effects?: Record<string, unknown> }> }).domains
  ];
  const samples = new Map<string, unknown>();
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.effects ?? {})) {
      if (!samples.has(key)) samples.set(key, value);
    }
  }
  return [...samples.entries()];
};

describe("tech/domain effect keys have a summary label", () => {
  for (const [key, value] of effectKeysWithSampleValue()) {
    it(`covers "${key}"`, () => {
      expect(effectSummaryLabel(key, value)).not.toBeNull();
    });
  }
});
