// Self-contained runtime dashboard served at GET /admin/runtime/dashboard.
//
// Deliberately a single static HTML string with no build step, no bundle, and
// no packages/client involvement — that keeps it off the client-changelog
// pre-push hook and means it ships with the gateway. It polls
// /admin/runtime/metrics (gateway + proxied sim Prometheus text), parses the
// metrics in-browser, and renders the comparison-critical gauges grouped by
// subsystem so AI-on vs AI-off staging runs can be eyeballed live.
//
// The token is read from the page's own ?token= query param and forwarded to
// the metrics fetch, so opening /admin/runtime/dashboard?token=XYZ just works.

export const RUNTIME_DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>border-empires · runtime dashboard</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: #0d1117; color: #c9d1d9; }
  header { position: sticky; top: 0; background: #161b22; padding: 10px 16px; border-bottom: 1px solid #30363d; display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
  header h1 { font-size: 14px; margin: 0; font-weight: 600; }
  header .meta { color: #8b949e; }
  header .err { color: #f85149; }
  main { padding: 12px 16px 48px; display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
  section { border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
  section h2 { font-size: 12px; margin: 0; padding: 6px 10px; background: #21262d; color: #58a6ff; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 10px; border-top: 1px solid #21262d; vertical-align: top; }
  td.k { color: #8b949e; white-space: nowrap; }
  td.v { text-align: right; font-variant-numeric: tabular-nums; }
  td.v.warn { color: #d29922; }
  td.v.bad { color: #f85149; }
  .controls { display: flex; gap: 10px; align-items: baseline; }
  button, select { font: inherit; background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
</head>
<body>
<header>
  <h1>runtime dashboard</h1>
  <span class="meta" id="status">connecting…</span>
  <span class="err" id="error"></span>
  <span class="controls">
    <label>refresh
      <select id="interval">
        <option value="2000">2s</option>
        <option value="5000">5s</option>
        <option value="10000">10s</option>
        <option value="0">paused</option>
      </select>
    </label>
    <button id="refresh">refresh now</button>
  </span>
</header>
<main id="grid"></main>
<script>
const token = new URLSearchParams(location.search).get("token") || "";
const metricsUrl = "/admin/runtime/metrics" + (token ? "?token=" + encodeURIComponent(token) : "");

// Minimal Prometheus text parser: returns Map<name, Array<{labels, value}>>.
function parseProm(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/);
    if (!m) continue;
    const [, name, rawLabels, rawVal] = m;
    const value = Number(rawVal);
    if (!Number.isFinite(value)) continue;
    const labels = {};
    if (rawLabels) {
      for (const pair of rawLabels.slice(1, -1).split(",")) {
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        labels[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^"|"$/g, "");
      }
    }
    if (!out.has(name)) out.set(name, []);
    out.get(name).push({ labels, value });
  }
  return out;
}

// Pick a single value for name+label filter.
function val(M, name, filter) {
  const rows = M.get(name);
  if (!rows) return undefined;
  for (const r of rows) {
    if (!filter) return r.value;
    if (Object.entries(filter).every(([k, v]) => r.labels[k] === v)) return r.value;
  }
  return undefined;
}
function quant(M, name, extra) {
  return ["p50", "p95", "p99"].map((q) => val(M, name, { quantile: q, ...(extra || {}) }));
}
const fmt = (n) => (n === undefined ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2));

// thresholds: [warnAbove, badAbove] for coloring a numeric cell
function cell(n, warn, bad) {
  const cls = n === undefined ? "" : bad !== undefined && n >= bad ? "bad" : warn !== undefined && n >= warn ? "warn" : "";
  return '<td class="v ' + cls + '">' + fmt(n) + "</td>";
}

function section(title, rows) {
  return '<section><h2>' + title + '</h2><table>' +
    rows.map((r) => '<tr><td class="k">' + r[0] + '</td>' + (r[2] === "raw" ? '<td class="v">' + r[1] + '</td>' : cell(r[1], r[2], r[3])) + '</tr>').join("") +
    '</table></section>';
}
function quantSection(title, M, name, extra, warn, bad) {
  const [p50, p95, p99] = quant(M, name, extra);
  return section(title, [["p50", p50, warn, bad], ["p95", p95, warn, bad], ["p99", p99, warn, bad]]);
}

function render(M) {
  const lanes = ["human_interactive", "human_noninteractive", "system", "ai"];
  const parts = [];

  parts.push(section("event loop lag (ms)", [
    ["gateway p50", quant(M, "gateway_event_loop_delay_ms")[0], 50, 250],
    ["gateway p99", quant(M, "gateway_event_loop_delay_ms")[2], 100, 250],
    ["gateway max", val(M, "gateway_event_loop_max_ms"), 250, 1000],
    ["sim p50", quant(M, "sim_event_loop_delay_ms")[0], 50, 250],
    ["sim p99", quant(M, "sim_event_loop_delay_ms")[2], 100, 250],
    ["sim max", val(M, "sim_event_loop_max_ms"), 250, 1000],
  ]));

  parts.push(section("sim tick duration (ms)", [
    ["ai p50", quant(M, "sim_tick_duration_ms", { source: "ai" })[0], 50, 200],
    ["ai p99", quant(M, "sim_tick_duration_ms", { source: "ai" })[2], 200, 1000],
    ["system p50", quant(M, "sim_tick_duration_ms", { source: "system" })[0], 50, 200],
    ["system p99", quant(M, "sim_tick_duration_ms", { source: "system" })[2], 200, 1000],
  ]));

  parts.push(section("queue / backlog", [
    ["human_interactive backlog ms", val(M, "sim_human_interactive_backlog_ms"), 250, 2500],
    ["runtime drain p99 ms", quant(M, "sim_runtime_drain_ms")[2], 50, 250],
    ["drain jobs/call p99", quant(M, "sim_runtime_drain_jobs_per_call")[2], undefined, undefined],
  ]));

  parts.push(section("command accept latency p99 (ms) by lane",
    lanes.map((l) => [l, quant(M, "sim_command_accept_latency_ms", { lane: l })[2], 250, 2500])));

  parts.push(section("gateway submit / rpc latency p99 (ms)", [
    ["command submit p50", quant(M, "gateway_command_submit_latency_ms")[0], 250, 2500],
    ["command submit p99", quant(M, "gateway_command_submit_latency_ms")[2], 1000, 2500],
    ["sim rpc p99", quant(M, "gateway_sim_rpc_latency_ms")[2], 1000, 2500],
    ["input→state update p99", quant(M, "gateway_input_to_state_update_latency_ms")[2], 1000, 2500],
  ]));

  // apply-time by command type (top offenders: EXPAND / ATTACK / SETTLE)
  const applyRows = (M.get("sim_runtime_apply_ms_by_command") || [])
    .filter((r) => r.labels.quantile === "p99")
    .sort((a, b) => b.value - a.value).slice(0, 8)
    .map((r) => [r.labels.type + " p99", r.value, 25, 100]);
  parts.push(section("apply ms by command (p99, top 8)", applyRows.length ? applyRows : [["(none)", undefined, "raw"]]));

  parts.push(section("AI", [
    ["autopilot enabled", val(M, "sim_ai_autopilot_enabled") === 1 ? "yes" : "no", "raw"],
    ["autopilot players", val(M, "sim_ai_autopilot_player_count"), "raw"],
    ["current tick interval ms", val(M, "sim_ai_current_tick_interval_ms"), 500, 2000],
    ["budget used ms / 1s", val(M, "sim_ai_budget_used_ms"), 150, 200],
    ["planner breaches", val(M, "sim_ai_planner_breaches"), "raw"],
  ]));

  const aiCmds = (M.get("sim_ai_command_total") || []).filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value).map((r) => [r.labels.type, r.value, "raw"]);
  parts.push(section("AI commands submitted (cumulative)", aiCmds.length ? aiCmds : [["(none)", 0, "raw"]]));

  const throttles = (M.get("sim_ai_tick_throttled_total") || []).filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value).map((r) => [r.labels.reason, r.value, "raw"]);
  parts.push(section("AI tick throttles (cumulative)", throttles.length ? throttles : [["(none)", 0, "raw"]]));

  parts.push(section("snapshot / delta size", [
    ["sim snapshot tiles json bytes p99", quant(M, "sim_snapshot_tiles_json_bytes")[2], 500000, 2000000],
    ["sim snapshot tile count p99", quant(M, "sim_snapshot_tile_count")[2], "raw"],
    ["gateway snapshot json bytes p99", quant(M, "gateway_snapshot_json_bytes")[2], 500000, 2000000],
  ]));

  parts.push(section("event store write (ms)", [
    ["p50", quant(M, "sim_event_store_write_ms")[0], 10, 50],
    ["p99", quant(M, "sim_event_store_write_ms")[2], 50, 250],
  ]));

  parts.push(section("memory / cpu", [
    ["gateway rss mb", val(M, "gateway_rss_mb"), 700, 850],
    ["gateway heap used mb", val(M, "gateway_heap_used_mb"), "raw"],
    ["gateway cpu %", val(M, "gateway_cpu_percent"), 80, 95],
    ["sim heap used mb", val(M, "sim_heap_used_mb"), 650, 800],
    ["sim cpu %", val(M, "sim_cpu_percent"), 80, 95],
    ["sim gc pause p99 ms", quant(M, "sim_gc_pause_ms")[2], 50, 200],
    ["ws sessions", val(M, "gateway_ws_sessions"), "raw"],
  ]));

  document.getElementById("grid").innerHTML = parts.join("");
}

let timer = null;
async function tick() {
  try {
    const res = await fetch(metricsUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + (res.status === 401 ? " — add ?token=" : ""));
    const text = await res.text();
    render(parseProm(text));
    document.getElementById("status").textContent = "updated " + new Date().toLocaleTimeString();
    document.getElementById("error").textContent = "";
  } catch (e) {
    document.getElementById("error").textContent = String(e.message || e);
  }
}
function schedule() {
  if (timer) clearInterval(timer);
  const ms = Number(document.getElementById("interval").value);
  if (ms > 0) timer = setInterval(tick, ms);
}
document.getElementById("interval").addEventListener("change", schedule);
document.getElementById("refresh").addEventListener("click", tick);
tick();
schedule();
</script>
</body>
</html>`;
