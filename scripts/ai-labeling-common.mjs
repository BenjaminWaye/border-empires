import { readFile } from "node:fs/promises";

const DEFAULT_MAX_OUTPUT_TOKENS = 384;

export const teacherLabelSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    phase: {
      type: "string",
      enum: ["opening", "growth", "pressure", "defense", "conversion"]
    },
    primaryGoal: {
      type: "string",
      enum: [
        "expand_frontier",
        "scout",
        "scaffold_settlement",
        "settle",
        "grow_economy",
        "fortify",
        "pressure_enemy",
        "clear_barbarians",
        "recover"
      ]
    },
    frontierClass: {
      type: "string",
      enum: ["economic", "scaffold", "scout", "waste", "none"]
    },
    moveQuality: {
      type: "string",
      enum: ["strong", "playable", "dubious", "blunder"]
    },
    hiddenMechanics: {
      type: "array",
      items: { type: "string" }
    },
    tacticalMotifs: {
      type: "array",
      items: { type: "string" }
    },
    strategicExplanation: {
      type: "string"
    },
    betterAction: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string" },
            reason: { type: "string" }
          },
          required: ["type", "reason"]
        }
      ]
    },
    trainingTargets: {
      type: "object",
      additionalProperties: false,
      properties: {
        shouldSettleSoon: { type: "boolean" },
        shouldPressureEnemy: { type: "boolean" },
        shouldPreferScoutShape: { type: "boolean" },
        shouldBuildEconomy: { type: "boolean" }
      },
      required: [
        "shouldSettleSoon",
        "shouldPressureEnemy",
        "shouldPreferScoutShape",
        "shouldBuildEconomy"
      ]
    }
  },
  required: [
    "phase",
    "primaryGoal",
    "frontierClass",
    "moveQuality",
    "hiddenMechanics",
    "tacticalMotifs",
    "strategicExplanation",
    "betterAction",
    "trainingTargets"
  ]
};

export const parseJsonLines = async (filePath) => {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSON on line ${index + 1} of ${filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });
};

export const assertTrainingRecord = (record, index) => {
  if (!record || typeof record !== "object") {
    throw new Error(`Record ${index + 1} must be an object`);
  }
  if (typeof record.recordId !== "string" || record.recordId.length === 0) {
    throw new Error(`Record ${index + 1} is missing string field "recordId"`);
  }
  if (!record.plannerState || typeof record.plannerState !== "object") {
    throw new Error(`Record ${index + 1} is missing object field "plannerState"`);
  }
  if (!record.chosenAction || typeof record.chosenAction !== "object") {
    throw new Error(`Record ${index + 1} is missing object field "chosenAction"`);
  }
};

export const parseNonNegativeIntegerEnv = (name, fallback = 0) => {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
};

export const parsePositiveIntegerEnv = (name, fallback) => {
  const value = parseNonNegativeIntegerEnv(name, fallback);
  if (value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

export const parseNonNegativeNumberEnv = (name, fallback = 0) => {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
};

export const parseBooleanEnv = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
};

const omitNullish = (value) => {
  if (Array.isArray(value)) {
    return value.map(omitNullish);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
      .map(([key, entryValue]) => [key, omitNullish(entryValue)])
  );
};

export const buildTeacherContext = (record) =>
  omitNullish({
    recordId: record.recordId,
    source: record.source,
    plannerState: record.plannerState,
    chosenAction: record.chosenAction,
    candidates: record.candidates,
    visibleSnapshot: record.visibleSnapshot,
    outcome: record.outcome,
    notes: record.notes
  });

export const buildTeacherPrompt = (record) => {
  const context = buildTeacherContext(record);

  return [
    "You are labeling a Border Empires AI training record.",
    "Act as an expert strategy coach, not as a roleplayer.",
    "Infer the strategic intent, tactical motif, and hidden-mechanic implications behind the chosen action.",
    "Be concrete and terse.",
    "",
    "Return JSON only with this exact shape:",
    "{",
    '  "phase": "opening|growth|pressure|defense|conversion",',
    '  "primaryGoal": "expand_frontier|scout|scaffold_settlement|settle|grow_economy|fortify|pressure_enemy|clear_barbarians|recover",',
    '  "frontierClass": "economic|scaffold|scout|waste|none",',
    '  "moveQuality": "strong|playable|dubious|blunder",',
    '  "hiddenMechanics": ["short strings"],',
    '  "tacticalMotifs": ["short strings"],',
    '  "strategicExplanation": "one sentence, max 160 chars",',
    '  "betterAction": null or {"type":"ACTION_TYPE","reason":"short string"},',
    '  "trainingTargets": {',
    '    "shouldSettleSoon": true or false,',
    '    "shouldPressureEnemy": true or false,',
    '    "shouldPreferScoutShape": true or false,',
    '    "shouldBuildEconomy": true or false',
    "  }",
    "}",
    "",
    "Record:",
    JSON.stringify(context)
  ].join("\n");
};

export const estimateTokens = (text) => Math.ceil(text.length / 4);

export const estimateRecordPromptTokens = (record) => estimateTokens(buildTeacherPrompt(record));

export const getMaxOutputTokens = () =>
  parsePositiveIntegerEnv("AI_LABELING_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS);

export const getModelPricing = (model) => {
  const inputUsdPerMTok = parseNonNegativeNumberEnv("AI_LABELING_INPUT_USD_PER_MTOK", 0);
  const outputUsdPerMTok = parseNonNegativeNumberEnv("AI_LABELING_OUTPUT_USD_PER_MTOK", 0);
  if (inputUsdPerMTok <= 0 || outputUsdPerMTok <= 0) {
    throw new Error(
      [
        `Set AI_LABELING_INPUT_USD_PER_MTOK and AI_LABELING_OUTPUT_USD_PER_MTOK before estimating hosted cost for ${model}.`,
        "Use the provider's current per-million-token prices; this script intentionally fails closed when pricing is not explicit."
      ].join(" ")
    );
  }
  return { inputUsdPerMTok, outputUsdPerMTok };
};

export const estimateRecordCostUsd = (inputTokens, maxOutputTokens, pricing) =>
  (inputTokens / 1_000_000) * pricing.inputUsdPerMTok
  + (maxOutputTokens / 1_000_000) * pricing.outputUsdPerMTok;

export const summarizeTokenUsage = (entries) => {
  const sortedInputTokens = entries.map((entry) => entry.estimatedInputTokens).sort((a, b) => a - b);
  const percentile = (p) => {
    if (sortedInputTokens.length === 0) return 0;
    const index = Math.min(sortedInputTokens.length - 1, Math.floor((sortedInputTokens.length - 1) * p));
    return sortedInputTokens[index];
  };
  const totalInputTokens = entries.reduce((sum, entry) => sum + entry.estimatedInputTokens, 0);
  const totalOutputTokenCap = entries.reduce((sum, entry) => sum + entry.maxOutputTokens, 0);
  const estimatedCostUsd = entries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);
  return {
    records: entries.length,
    totalInputTokens,
    totalOutputTokenCap,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    inputTokens: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: sortedInputTokens.at(-1) ?? 0
    },
    mostExpensiveRecords: [...entries]
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
      .slice(0, 20)
  };
};

export const buildTokenUsageEntries = (records, { model, pricing, maxOutputTokens }) =>
  records.map((record) => {
    const estimatedInputTokens = estimateRecordInputTokens(record, model, maxOutputTokens);
    const estimatedCostUsd = estimateRecordCostUsd(estimatedInputTokens, maxOutputTokens, pricing);
    return {
      recordId: record.recordId,
      model,
      estimatedInputTokens,
      maxOutputTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
    };
  });

export const enforceTokenUsageLimits = (summary) => {
  const maxInputTokens = parseNonNegativeIntegerEnv("AI_LABELING_MAX_INPUT_TOKENS", 0);
  const maxTotalTokens = parseNonNegativeIntegerEnv("AI_LABELING_MAX_TOTAL_TOKENS", 0);
  const maxEstimatedUsd = parseNonNegativeNumberEnv("AI_LABELING_MAX_ESTIMATED_USD", 0);

  if (maxInputTokens > 0 && summary.inputTokens.max > maxInputTokens) {
    throw new Error(
      `AI labeling prompt limit exceeded: max record input estimate ${summary.inputTokens.max} > AI_LABELING_MAX_INPUT_TOKENS ${maxInputTokens}`
    );
  }
  if (
    maxTotalTokens > 0 &&
    summary.totalInputTokens + summary.totalOutputTokenCap > maxTotalTokens
  ) {
    throw new Error(
      `AI labeling token limit exceeded: estimated total ${
        summary.totalInputTokens + summary.totalOutputTokenCap
      } > AI_LABELING_MAX_TOTAL_TOKENS ${maxTotalTokens}`
    );
  }
  if (maxEstimatedUsd > 0 && summary.estimatedCostUsd > maxEstimatedUsd) {
    throw new Error(
      `AI labeling cost limit exceeded: estimated $${summary.estimatedCostUsd} > AI_LABELING_MAX_ESTIMATED_USD $${maxEstimatedUsd}`
    );
  }
};

const EXTENDED_PROMPT_CACHE_MODELS = new Set([
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.1-chat-latest",
  "gpt-5",
  "gpt-5-codex",
  "gpt-4.1"
]);

const shouldUseExtendedPromptCache = (model) => {
  const raw = process.env.AI_LABELING_PROMPT_CACHE_RETENTION;
  if (raw == null || raw.trim() === "") return false;
  const value = raw.trim().toLowerCase();
  if (value === "in_memory" || value === "off" || value === "0" || value === "false") return false;
  if (value !== "24h") {
    throw new Error("AI_LABELING_PROMPT_CACHE_RETENTION must be 24h, in_memory, off, 0, or false");
  }
  if (!EXTENDED_PROMPT_CACHE_MODELS.has(model)) {
    throw new Error(
      `AI_LABELING_PROMPT_CACHE_RETENTION=24h is not enabled for model ${model}; use a supported model or omit the env var.`
    );
  }
  return true;
};

export const buildBatchBody = (record, model = "gpt-5-mini", options = {}) => {
  const maxOutputTokens = options.maxOutputTokens ?? getMaxOutputTokens();
  const body = {
    model,
    input: buildTeacherPrompt(record),
    max_output_tokens: maxOutputTokens,
    prompt_cache_key: "border-empires-ai-label-v1",
    text: {
      format: {
        type: "json_schema",
        name: "border_empires_ai_teacher_label",
        schema: teacherLabelSchema
      }
    }
  };

  if (shouldUseExtendedPromptCache(model)) {
    body.prompt_cache_retention = "24h";
  }

  return body;
};

export const estimateRecordInputTokens = (record, model, maxOutputTokens) =>
  estimateTokens(JSON.stringify(buildBatchBody(record, model, { maxOutputTokens })));

export const buildBatchEntry = (record, model = "gpt-5-mini") => ({
  custom_id: record.recordId,
  method: "POST",
  url: "/v1/responses",
  body: buildBatchBody(record, model)
});

export const extractFirstJsonObject = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return JSON.parse(trimmed.slice(start, index + 1));
      }
    }
  }
  throw new Error("Response did not contain a parseable JSON object");
};
