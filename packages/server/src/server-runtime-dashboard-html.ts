export const renderRuntimeDashboardHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Border Empires Runtime Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #09131a;
        --bg2: #10222c;
        --panel: rgba(14, 29, 37, 0.9);
        --panel-border: rgba(156, 198, 210, 0.18);
        --text: #e7f4f7;
        --muted: #8da7af;
        --accent: #67e8f9;
        --warn: #fbbf24;
        --danger: #f87171;
        --good: #4ade80;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background:
          radial-gradient(circle at top left, rgba(103, 232, 249, 0.16), transparent 28rem),
          radial-gradient(circle at top right, rgba(248, 113, 113, 0.12), transparent 24rem),
          linear-gradient(180deg, var(--bg), #050a0e 75%);
        color: var(--text);
      }
      .wrap {
        max-width: 1440px;
        margin: 0 auto;
        padding: 24px;
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 16px;
        align-items: end;
        margin-bottom: 20px;
      }
      .hero h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 44px);
        letter-spacing: -0.04em;
      }
      .hero p, .meta {
        margin: 6px 0 0;
        color: var(--muted);
      }
      .status {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        border: 1px solid var(--panel-border);
        background: rgba(103, 232, 249, 0.06);
        padding: 10px 14px;
        border-radius: 999px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--good);
        box-shadow: 0 0 18px rgba(74, 222, 128, 0.8);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 14px;
      }
      .panel {
        grid-column: span 12;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 16px;
        backdrop-filter: blur(10px);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
      }
      .span-3 { grid-column: span 3; }
      .span-4 { grid-column: span 4; }
      .span-6 { grid-column: span 6; }
      .span-8 { grid-column: span 8; }
      .span-12 { grid-column: span 12; }
      .panel h2, .panel h3 {
        margin: 0 0 12px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--muted);
      }
      .metric {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .metric:first-of-type { border-top: 0; padding-top: 0; }
      .metric strong {
        font-size: 24px;
        display: block;
        margin-top: 4px;
      }
      .muted { color: var(--muted); }
      .flag {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 12px;
        border: 1px solid currentColor;
      }
      .flag.good { color: var(--good); }
      .flag.warn { color: var(--warn); }
      .flag.danger { color: var(--danger); }
      .mini-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .chart {
        margin-top: 14px;
        height: 160px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
        border: 1px solid rgba(255,255,255,0.06);
        padding: 10px;
      }
      svg { width: 100%; height: 100%; overflow: visible; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th, td {
        text-align: left;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      th { color: var(--muted); font-weight: 500; }
      .bar {
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .bar > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), #38bdf8);
      }
      .empty {
        color: var(--muted);
        padding: 18px 0 4px;
      }
      @media (max-width: 980px) {
        .span-3, .span-4, .span-6, .span-8, .span-12 { grid-column: span 12; }
        .mini-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <div>
          <h1>Runtime Pressure Dashboard</h1>
          <p>Track what is consuming CPU time, memory, and event-loop headroom on this server.</p>
          <p class="meta" id="subtitle">Waiting for first sample...</p>
        </div>
        <div class="status">
          <span class="dot"></span>
          <span id="status-text">Polling /admin/runtime/debug every 5s</span>
        </div>
      </div>

      <div class="grid">
        <section class="panel span-3" id="summary-runtime"></section>
        <section class="panel span-3" id="summary-memory"></section>
        <section class="panel span-3" id="summary-load"></section>
        <section class="panel span-3" id="summary-world"></section>
        <section class="panel span-8" id="timeline-panel"></section>
        <section class="panel span-4" id="hotspots-panel"></section>
        <section class="panel span-6" id="collections-panel"></section>
        <section class="panel span-6" id="events-panel"></section>
      </div>
    </div>
    <script>
      const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      };
      const fmt = (value, suffix = "") => {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
        return \`\${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}\${suffix}\`;
      };
      const fmtTime = (ts) => new Date(ts).toLocaleTimeString();
      const healthFlag = (value, warnAt, dangerAt, inverse = false) => {
        const state = inverse
          ? value <= dangerAt ? "danger" : value <= warnAt ? "warn" : "good"
          : value >= dangerAt ? "danger" : value >= warnAt ? "warn" : "good";
        return \`<span class="flag \${state}">\${state}</span>\`;
      };
      const sparkline = (values, color, maxValue) => {
        if (!values.length) return '<div class="empty">No samples yet.</div>';
        const width = 600;
        const height = 140;
        const max = Math.max(maxValue || 0, ...values, 1);
        const min = Math.min(...values, 0);
        const range = Math.max(1, max - min);
        const points = values.map((value, index) => {
          const x = (index / Math.max(1, values.length - 1)) * width;
          const y = height - ((value - min) / range) * height;
          return \`\${x},\${y}\`;
        }).join(" ");
        return \`
          <svg viewBox="0 0 \${width} \${height}" preserveAspectRatio="none">
            <polyline fill="none" stroke="\${color}" stroke-width="3" points="\${points}" />
          </svg>
        \`;
      };
      const metricRow = (label, value, detail = "") => \`
        <div class="metric">
          <div>
            <div class="muted">\${label}</div>
            \${detail ? \`<div class="muted">\${detail}</div>\` : ""}
          </div>
          <div style="text-align:right"><strong>\${value}</strong></div>
        </div>
      \`;
      const renderCollections = (items) => {
        if (!items.length) return '<div class="empty">No collection stats available.</div>';
        const max = Math.max(...items.map((item) => item.entries), 1);
        return \`
          <h2>Largest Internal Collections</h2>
          <table>
            <thead><tr><th>Collection</th><th>Entries</th><th>Share</th></tr></thead>
            <tbody>
              \${items.map((item) => \`
                <tr>
                  <td>\${item.name}</td>
                  <td>\${item.entries.toLocaleString()}</td>
                  <td style="width:38%">
                    <div class="bar"><span style="width:\${Math.max(4, (item.entries / max) * 100)}%"></span></div>
                  </td>
                </tr>\`).join("")}
            </tbody>
          </table>
        \`;
      };
      const renderHotspotBlock = (title, hotspot, extraHtml) => \`
        <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.06)">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <strong>\${title}</strong>
            \${healthFlag(hotspot.p95Ms, 40, 100)}
          </div>
          <div class="mini-grid" style="margin-top:10px">
            <div>\${metricRow("Last", fmt(hotspot.lastMs, " ms"))}</div>
            <div>\${metricRow("P95", fmt(hotspot.p95Ms, " ms"))}</div>
            <div>\${metricRow("Average", fmt(hotspot.avgMs, " ms"))}</div>
            <div>\${metricRow("Max", fmt(hotspot.maxMs, " ms"))}</div>
          </div>
          \${extraHtml}
        </div>
      \`;
      const load = async () => {
        try {
          const res = await fetch("/admin/runtime/debug", { cache: "no-store" });
          const data = await res.json();
          const runtime = data.runtime;
          const vitals = data.history.vitals || [];
          const rssSeries = vitals.map((entry) => entry.rssMb);
          const cpuSeries = vitals.map((entry) => entry.cpuPercent);
          const loopSeries = vitals.map((entry) => entry.eventLoopUtilizationPercent);
          document.getElementById("subtitle").textContent =
            \`PID \${runtime.pid} • Node \${runtime.nodeVersion} • \${runtime.cpuCount} CPU cores • last sample \${fmtTime(data.at)}\`;

          setHtml("summary-runtime", \`
            <h2>Process Runtime</h2>
            \${metricRow("CPU (host normalized)", fmt(runtime.cpuPercent, "%"), "Percent of total machine CPU capacity")}
            \${metricRow("CPU (single core view)", fmt(runtime.cpuSingleCorePercent, "%"), "Can exceed 100% when multiple cores are busy")}
            \${metricRow("Event loop utilization", fmt(runtime.eventLoopUtilizationPercent, "%"))}
            \${metricRow("Uptime", fmt(runtime.uptimeSec, " s"))}
            \${metricRow("Handles / requests", \`\${fmt(runtime.activeHandles)} / \${fmt(runtime.activeRequests)}\`)}
          \`);

          setHtml("summary-memory", \`
            <h2>Memory</h2>
            \${metricRow("RSS", fmt(runtime.rssMb, " MB"), healthFlag(runtime.rssMb, 700, 1200))}
            \${metricRow("Heap used", fmt(runtime.heapUsedMb, " MB"))}
            \${metricRow("Heap total", fmt(runtime.heapTotalMb, " MB"))}
            \${metricRow("External", fmt(runtime.externalMb, " MB"))}
            \${metricRow("Array buffers", fmt(runtime.arrayBuffersMb, " MB"))}
          \`);

          setHtml("summary-load", \`
            <h2>Pressure</h2>
            \${metricRow("Event loop p95", fmt(runtime.eventLoopDelayP95Ms, " ms"), healthFlag(runtime.eventLoopDelayP95Ms, 30, 80))}
            \${metricRow("Event loop max", fmt(runtime.eventLoopDelayMaxMs, " ms"))}
            \${metricRow("Pending auth verifications", fmt(data.queuePressure.pendingAuthVerifications))}
            \${metricRow("Runtime intervals", fmt(data.queuePressure.runtimeIntervals))}
            \${metricRow("AI budget breaches", fmt(data.aiBudget.breaches), healthFlag(data.aiBudget.breaches, 1, 3))}
            \${metricRow("Chunk cache payload", fmt(data.caches.cachedChunkPayloadMb, " MB"))}
          \`);

          setHtml("summary-world", \`
            <h2>World / Cache Load</h2>
            \${metricRow("Players online / total", \`\${fmt(data.counts.onlinePlayers)} / \${fmt(data.counts.totalPlayers)}\`)}
            \${metricRow("AI players", fmt(data.counts.aiPlayers))}
            \${metricRow("Ownership tiles", fmt(data.counts.ownershipTiles))}
            \${metricRow("Towns / docks / clusters", \`\${fmt(data.counts.towns)} / \${fmt(data.counts.docks)} / \${fmt(data.counts.clusters)}\`)}
            \${metricRow("Visibility / chunk cache", \`\${fmt(data.caches.visibilitySnapshots)} / \${fmt(data.caches.cachedChunkPlayers)}\`)}
          \`);

          setHtml("timeline-panel", \`
            <h2>Recent Pressure Timeline</h2>
            <div class="mini-grid">
              <div>
                <div class="muted">CPU % of host</div>
                <div class="chart">\${sparkline(cpuSeries, "#67e8f9", 100)}</div>
              </div>
              <div>
                <div class="muted">RSS MB</div>
                <div class="chart">\${sparkline(rssSeries, "#f87171")}</div>
              </div>
              <div>
                <div class="muted">Event loop utilization %</div>
                <div class="chart">\${sparkline(loopSeries, "#fbbf24", 100)}</div>
              </div>
              <div>
                <div class="muted">Actionable read</div>
                <div class="metric">
                  <div>
                    <div class="muted">If CPU climbs with AI p95, AI ticks are the likely thief.</div>
                    <div class="muted">If RSS climbs with chunk cache MB, snapshot caching is the likely thief.</div>
                    <div class="muted">If event-loop delay spikes while handles stay flat, a synchronous code path is blocking.</div>
                  </div>
                </div>
              </div>
            </div>
          \`);

          setHtml("hotspots-panel", \`
            <h2>Internal Hotspots</h2>
            \${renderHotspotBlock("AI tick loop", data.hotspots.aiTicks, \`
              <div class="muted" style="margin-top:8px">Last AI player count: \${fmt(data.hotspots.aiTicks.lastAiPlayers)}</div>
            \`)}
            \${renderHotspotBlock("AI budget breaches", data.hotspots.aiBudget, \`
              <div class="muted" style="margin-top:8px">Budget: \${fmt(data.hotspots.aiBudget.budgetMs, " ms")} • Last phase: \${data.hotspots.aiBudget.lastPhase || "n/a"} • Last action: \${data.hotspots.aiBudget.lastActionKey || "n/a"}</div>
            \`)}
            \${renderHotspotBlock("Chunk snapshots", data.hotspots.chunkSnapshots, \`
              <div class="muted" style="margin-top:8px">Largest recent snapshot: \${fmt(data.hotspots.chunkSnapshots.maxChunks)} chunks / \${fmt(data.hotspots.chunkSnapshots.maxTiles)} tiles</div>
              <div class="muted" style="margin-top:8px">Last phases: mask \${fmt(data.hotspots.chunkSnapshots.lastVisibilityMaskMs, " ms")} • read \${fmt(data.hotspots.chunkSnapshots.lastSummaryReadMs, " ms")} • serialize \${fmt(data.hotspots.chunkSnapshots.lastSerializeMs, " ms")} • send \${fmt(data.hotspots.chunkSnapshots.lastSendMs, " ms")}</div>
            \`)}
          \`);

          setHtml("collections-panel", renderCollections(data.collections));

          const aiHistory = data.history.aiTicks || [];
          const chunkHistory = data.history.chunkSnapshots || [];
          setHtml("events-panel", \`
            <h2>Recent Heavy Operations</h2>
            <table>
              <thead><tr><th>Category</th><th>Latest</th><th>P95</th><th>Samples</th></tr></thead>
              <tbody>
                <tr><td>AI ticks</td><td>\${fmt(data.hotspots.aiTicks.lastMs, " ms")}</td><td>\${fmt(data.hotspots.aiTicks.p95Ms, " ms")}</td><td>\${fmt(data.hotspots.aiTicks.samples)}</td></tr>
                <tr><td>AI budget</td><td>\${fmt(data.hotspots.aiBudget.lastMs, " ms")}</td><td>\${fmt(data.hotspots.aiBudget.p95Ms, " ms")}</td><td>\${fmt(data.hotspots.aiBudget.samples)}</td></tr>
                <tr><td>Chunk snapshots</td><td>\${fmt(data.hotspots.chunkSnapshots.lastMs, " ms")}</td><td>\${fmt(data.hotspots.chunkSnapshots.p95Ms, " ms")}</td><td>\${fmt(data.hotspots.chunkSnapshots.samples)}</td></tr>
                <tr><td>Last AI sample at</td><td colspan="3">\${aiHistory.length ? fmtTime(aiHistory[aiHistory.length - 1].at) : "n/a"}</td></tr>
                <tr><td>Last chunk snapshot at</td><td colspan="3">\${chunkHistory.length ? fmtTime(chunkHistory[chunkHistory.length - 1].at) : "n/a"}</td></tr>
              </tbody>
            </table>
          \`);
        } catch (err) {
          document.getElementById("status-text").textContent = \`Dashboard fetch failed: \${err instanceof Error ? err.message : String(err)}\`;
        }
      };
      load();
      setInterval(load, 5000);
    </script>
  </body>
</html>`;
