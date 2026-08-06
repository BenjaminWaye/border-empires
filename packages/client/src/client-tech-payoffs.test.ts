import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTechHighlightEffectKey } from "./client-tech-payoffs.js";

const dataPath = (name: string): string =>
  fileURLToPath(new URL(`../../game-domain/data/${name}`, import.meta.url));
const techTreeData = JSON.parse(readFileSync(dataPath("tech-tree.json"), "utf8"));
const domainTreeData = JSON.parse(readFileSync(dataPath("domain-tree.json"), "utf8"));

// Regression coverage for a recurring bug class: an "unlockX" effect key
// gets added to a tech/domain in the data, but the two independent,
// hand-maintained label dictionaries that render it (this file's chip
// labels, and client-tech-html.ts's full-sentence formatter) don't get
// updated to match — silently rendering a blank chip / blank description
// line for that tech instead of failing loudly. This test catches the gap
// at the data layer so a missing label can't ship unnoticed again.
const allUnlockKeys = (): string[] => {
  const entries = [
    ...(techTreeData as { techs: Array<{ effects?: Record<string, unknown> }> }).techs,
    ...(domainTreeData as { domains: Array<{ effects?: Record<string, unknown> }> }).domains
  ];
  const keys = new Set<string>();
  for (const entry of entries) {
    for (const key of Object.keys(entry.effects ?? {})) {
      if (key.startsWith("unlock")) keys.add(key);
    }
  }
  return [...keys];
};

describe("tech/domain unlock effect keys have a highlight-chip label", () => {
  for (const key of allUnlockKeys()) {
    it(`covers "${key}"`, () => {
      expect(isTechHighlightEffectKey(key)).toBe(true);
    });
  }
});
