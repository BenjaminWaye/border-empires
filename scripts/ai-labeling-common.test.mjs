import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBatchBody,
  buildTeacherPrompt,
  buildTokenUsageEntries,
  enforceTokenUsageLimits,
  estimateRecordInputTokens,
  estimateRecordPromptTokens,
  summarizeTokenUsage
} from "./ai-labeling-common.mjs";

const withEnv = (patch, fn) => {
  const previous = new Map(Object.keys(patch).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const record = {
  recordId: "record-1",
  source: null,
  plannerState: {
    player: { id: "ai-1", gold: 50 },
    tiles: [{ x: 1, y: 2, ownerId: "ai-1" }]
  },
  chosenAction: { type: "EXPAND", payload: { x: 2, y: 2 } },
  candidates: null,
  visibleSnapshot: undefined,
  notes: "prefer coast"
};

test("buildTeacherPrompt compacts record JSON and omits nullish optional fields", () => {
  const prompt = buildTeacherPrompt(record);
  assert.match(prompt, /"recordId":"record-1"/);
  assert.doesNotMatch(prompt, /\n  "recordId"/);
  assert.doesNotMatch(prompt, /"source":null/);
  assert.doesNotMatch(prompt, /"candidates":null/);
  assert.doesNotMatch(prompt, /"visibleSnapshot"/);
});

test("token usage summary includes totals and most expensive records", () => {
  const entries = buildTokenUsageEntries([record], {
    model: "teacher-model",
    pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    maxOutputTokens: 100
  });
  const summary = summarizeTokenUsage(entries);
  assert.equal(summary.records, 1);
  assert.equal(summary.totalInputTokens, estimateRecordInputTokens(record, "teacher-model", 100));
  assert.ok(summary.totalInputTokens > estimateRecordPromptTokens(record));
  assert.equal(summary.totalOutputTokenCap, 100);
  assert.equal(summary.mostExpensiveRecords[0].recordId, "record-1");
  assert.ok(summary.estimatedCostUsd > 0);
});

test("buildBatchBody only includes 24h prompt cache retention when explicitly supported", () => {
  withEnv({ AI_LABELING_PROMPT_CACHE_RETENTION: undefined }, () => {
    const body = buildBatchBody(record, "gpt-5-mini", { maxOutputTokens: 100 });
    assert.equal(body.prompt_cache_retention, undefined);
  });

  withEnv({ AI_LABELING_PROMPT_CACHE_RETENTION: "24h" }, () => {
    const body = buildBatchBody(record, "gpt-5", { maxOutputTokens: 100 });
    assert.equal(body.prompt_cache_retention, "24h");
  });

  withEnv({ AI_LABELING_PROMPT_CACHE_RETENTION: "24h" }, () => {
    assert.throws(
      () => buildBatchBody(record, "gpt-5-mini", { maxOutputTokens: 100 }),
      /not enabled for model gpt-5-mini/
    );
  });
});

test("enforceTokenUsageLimits fails closed on total token cap", () => {
  withEnv(
    {
      AI_LABELING_MAX_INPUT_TOKENS: undefined,
      AI_LABELING_MAX_TOTAL_TOKENS: "10",
      AI_LABELING_MAX_ESTIMATED_USD: undefined
    },
    () => {
      assert.throws(
        () =>
          enforceTokenUsageLimits({
            inputTokens: { max: 9 },
            totalInputTokens: 9,
            totalOutputTokenCap: 2,
            estimatedCostUsd: 0
          }),
        /AI labeling token limit exceeded/
      );
    }
  );
});
