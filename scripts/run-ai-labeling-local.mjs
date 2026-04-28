#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTrainingRecord,
  buildTeacherPrompt,
  extractFirstJsonObject,
  parseJsonLines,
  teacherLabelSchema
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaultInput = path.resolve(rootDir, "tmp", "ai-training", "records.jsonl");
const defaultOutput = path.resolve(rootDir, "tmp", "ai-training", "labeled-records.local.jsonl");

const normalizeProvider = (raw) => {
  const provider = (raw ?? "ollama").trim().toLowerCase();
  if (provider === "openai-compatible") return "vllm";
  if (provider === "openai") return "vllm";
  if (provider === "vllm" || provider === "ollama") return provider;
  throw new Error(`Unsupported AI_LABELING_PROVIDER "${raw}"`);
};

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/run-ai-labeling-local.mjs [input-jsonl] [output-jsonl]",
      "",
      "Environment:",
      "  AI_LABELING_PROVIDER=ollama|vllm",
      "  AI_LABELING_MODEL=<model-name>",
      "  AI_LABELING_BASE_URL=<base-url>",
      "  AI_LABELING_CONCURRENCY=<n>",
      "  AI_LABELING_MAX_RECORDS=<n>",
      "",
      "Defaults:",
      "  ollama: provider=ollama, base=http://127.0.0.1:11434, model=qwen2.5:7b-instruct",
      "  vllm: provider=vllm, base=http://127.0.0.1:8000/v1, model=Qwen/Qwen2.5-7B-Instruct",
      "",
      "The output file is JSONL with one label result per training record."
    ].join("\n")
  );
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const provider = normalizeProvider(process.env.AI_LABELING_PROVIDER);
const defaultBaseUrl =
  provider === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:8000/v1";
const defaultModel =
  provider === "ollama" ? "qwen2.5:7b-instruct" : "Qwen/Qwen2.5-7B-Instruct";

const inputPath = path.resolve(process.cwd(), process.argv[2] ?? defaultInput);
const outputPath = path.resolve(process.cwd(), process.argv[3] ?? defaultOutput);
const baseUrl = (process.env.AI_LABELING_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, "");
const model = process.env.AI_LABELING_MODEL?.trim() || defaultModel;
const concurrency = Math.max(1, Number.parseInt(process.env.AI_LABELING_CONCURRENCY ?? "1", 10) || 1);
const maxRecords = Math.max(0, Number.parseInt(process.env.AI_LABELING_MAX_RECORDS ?? "0", 10) || 0);

const invokeOllama = async (prompt) => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: 0
      },
      format: "json",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const content = payload?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Ollama response did not include message.content");
  }
  return content;
};

const invokeVllm = async (prompt) => {
  const chatUrl = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl.replace(/\/v1$/, "")}/v1/chat/completions`;
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: {
        type: "json_object"
      }
    })
  });
  if (!response.ok) {
    throw new Error(`vLLM request failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("vLLM response did not include choices[0].message.content");
  }
  return content;
};

const validateLabelShape = (label) => {
  for (const requiredKey of teacherLabelSchema.required) {
    if (!(requiredKey in label)) {
      throw new Error(`Missing required label field "${requiredKey}"`);
    }
  }
  return label;
};

const labelRecord = async (record) => {
  const prompt = buildTeacherPrompt(record);
  const rawResponse =
    provider === "ollama" ? await invokeOllama(prompt) : await invokeVllm(prompt);
  const label = validateLabelShape(extractFirstJsonObject(rawResponse));
  return {
    recordId: record.recordId,
    provider,
    model,
    label
  };
};

const records = await parseJsonLines(inputPath);
records.forEach(assertTrainingRecord);
const selectedRecords = maxRecords > 0 ? records.slice(0, maxRecords) : records;

const results = new Array(selectedRecords.length);
let cursor = 0;

const worker = async () => {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= selectedRecords.length) return;
    const record = selectedRecords[index];
    results[index] = await labelRecord(record);
    console.log(`[ai:labeling:local] labeled ${index + 1}/${selectedRecords.length} ${record.recordId}`);
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, selectedRecords.length || 1) }, () => worker()));
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${results.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

console.log(`Wrote ${results.length} local labels to ${outputPath}`);
