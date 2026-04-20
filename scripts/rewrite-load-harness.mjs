#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const now = new Date();
const dateStamp = now.toISOString().slice(0, 10);

const parsePrometheus = (text) => {
  const metrics = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    const value = Number(parts[1]);
    if (!Number.isFinite(value)) continue;
    metrics[name] = value;
  }
  return metrics;
};

const fetchMetrics = async (url) => {
  const response = await fetch(url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return parsePrometheus(await response.text());
};

const gatewayMetricsUrl = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const simulationMetricsUrl = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";

const [gateway, simulation] = await Promise.all([fetchMetrics(gatewayMetricsUrl), fetchMetrics(simulationMetricsUrl)]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "docs", "load-results", `${dateStamp}.json`);
await mkdir(dirname(outputPath), { recursive: true });

const payload = {
  at: now.toISOString(),
  gatewayMetricsUrl,
  simulationMetricsUrl,
  gateway,
  simulation,
  gates: {
    gateway_event_loop_max_ms: gateway["gateway_event_loop_max_ms"] ?? null,
    sim_human_interactive_backlog_ms: simulation["sim_human_interactive_backlog_ms"] ?? null,
    sim_checkpoint_rss_mb: simulation["sim_checkpoint_rss_mb"] ?? null
  }
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(outputPath);
