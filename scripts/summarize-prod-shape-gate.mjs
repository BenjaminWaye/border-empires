#!/usr/bin/env node
// Prints a human summary of a prod-shape gate result JSON (for the Actions job
// summary) and flags passes that checked less than they appear to: skipped
// latency checks, zero accepted samples, an unconfirmed probe player. It never
// changes the gate's pass/fail outcome -- that stays in rewrite-prod-shape-gate.mjs.
//
// Usage: node scripts/summarize-prod-shape-gate.mjs <result.json>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);

export const summarizeGateResult = (payload) => {
  const warnings = [];
  const lines = [`### Prod-shape gate: ${payload.ok ? "ok" : "FAILED"}`, ""];

  const probe = payload.probe ?? {};
  lines.push(`- probe: autoProbePlayer=${String(probe.autoProbePlayer)}${probe.discovery ? `, discovery=${JSON.stringify(probe.discovery)}` : ""}`);
  if (probe.discovery?.ok !== true) {
    warnings.push("probe player was not discovered in the cloned DB (discovery missing or failed); the gate may have exercised an empty account");
  }

  const soak = payload.soak ?? {};
  const soakScalars = Object.entries(soak).filter(([, value]) => scalar(value));
  lines.push(`- soak: ${soakScalars.map(([key, value]) => `${key}=${String(value)}`).join(", ") || "(no scalar fields)"}`);
  if (typeof soak.acceptedSamples === "number" && soak.acceptedSamples === 0) {
    warnings.push("soak accepted 0 commands (acceptedSamples=0); accepted-latency checks did not run");
  }

  const checks = [...(payload.gates?.absolute ?? []), ...(payload.gates?.regression ?? [])];
  const skipped = checks.filter((check) => check.skipped === true).map((check) => check.name);
  lines.push(`- checks: ${checks.length} total, ${checks.filter((check) => check.ok).length} ok, skipped: ${skipped.join(", ") || "none"}`);
  if (skipped.length > 0) warnings.push(`gate checks skipped: ${skipped.join(", ")}`);

  for (const [name, smoke] of Object.entries(payload.smokes ?? {})) {
    lines.push(`- smoke ${name}: ${JSON.stringify(smoke).slice(0, 300)}`);
  }
  return { lines, warnings };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: summarize-prod-shape-gate.mjs <result.json>");
    process.exit(2);
  }
  const { lines, warnings } = summarizeGateResult(JSON.parse(readFileSync(path, "utf8")));
  console.log(lines.join("\n"));
  for (const warning of warnings) console.log(`::warning title=prod-shape gate::${warning}`);
}
