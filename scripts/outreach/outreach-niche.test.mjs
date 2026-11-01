import assert from "node:assert/strict";
import { test } from "node:test";

import { buildNicheDraft, plausibleMomentum, powerCsv, summariseActivity, warsCsv } from "./outreach-niche.mjs";

const activity = {
  powerScore: [
    { id: "ai-1", name: "Solveig", rank: 1, tiles: 646, score: 1027.1 },
    { id: "uid-a", name: "bvsii", rank: 2, tiles: 300, score: 500 },
    { id: "ai-2", name: "Ivar", rank: 3, tiles: 200, score: 300 },
    { id: "barbarian-1", name: "Planetary Defense", rank: 4, tiles: 100, score: 1 }
  ],
  wars: [
    { playerAName: "Ivar", playerBName: "Oskar", tileFlips24h: 486, tilesContested24h: 166 },
    { playerAName: "A", playerBName: "B", tileFlips24h: 900, tilesContested24h: 20 }
  ],
  truceWatch: [{}, {}],
  manpowerLost24h: 117080,
  territoryMomentum: [
    { net24h: 47356, tilesGained24h: 475, tilesLost24h: 0 },
    { net24h: 10, tilesGained24h: 12, tilesLost24h: 2 }
  ]
};

test("plausibleMomentum rejects net larger than gained + lost", () => {
  assert.equal(plausibleMomentum(activity.territoryMomentum[0]), false);
  assert.equal(plausibleMomentum(activity.territoryMomentum[1]), true);
});

test("summariseActivity counts AI vs human empires, excluding barbarians", () => {
  const s = summariseActivity(activity);
  assert.equal(s.empires, 3);
  assert.equal(s.aiCount, 2);
  assert.equal(s.topIsAi, true);
  assert.equal(s.topHumanRank, 2);
  assert.equal(s.topWar.tileFlips24h, 900);
  assert.equal(s.droppedMomentumRows, 1);
});

test("buildNicheDraft quotes real numbers and keeps the link out of post bodies", () => {
  const md = buildNicheDraft(activity, "https://play.borderempires.com/?utm_source=reddit");
  assert.match(md, /2 of 3 ranked empires are AI, and an AI holds rank 1 \(best human: rank 2\)/);
  assert.match(md, /A vs B: 900 tile flips/);
  assert.match(md, /momentum rows dropped as implausible/);
  assert.equal(md.split("utm_source=reddit").length - 1, 1);
});

test("CSV exports are ranked and skip barbarians", () => {
  assert.equal(warsCsv(activity).split("\n")[1], '"A vs B",900,20');
  assert.deepEqual(powerCsv(activity).split("\n").slice(1).map((l) => l.split(",")[1]), ["ai", "human", "ai"]);
});
