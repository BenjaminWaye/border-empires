// Self-contained GET /admin/players/insights page (same no-build approach as
// runtime-dashboard-html.ts). Fetches /admin/players/insights.json with the
// page's own ?token= and renders it client-side. Player names are rendered
// via textContent only.

export const PLAYER_INSIGHTS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>border-empires · player insights</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; background: #0d1117; color: #c9d1d9; }
  header { position: sticky; top: 0; z-index: 2; background: #161b22; padding: 10px 16px; border-bottom: 1px solid #30363d; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  header h1 { font-size: 14px; margin: 0; font-weight: 600; }
  .meta { color: #8b949e; }
  .err { color: #f85149; }
  a { color: #58a6ff; text-decoration: none; }
  main { padding: 12px 16px 48px; display: grid; gap: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 16px; align-items: start; }
  section { border: 1px solid #30363d; border-radius: 6px; overflow: hidden; min-width: 0; }
  h2 { font-size: 12px; margin: 0; padding: 6px 10px; background: #21262d; color: #58a6ff; text-transform: uppercase; letter-spacing: .04em; }
  .note { margin: 0; padding: 6px 10px; color: #8b949e; border-bottom: 1px solid #21262d; }
  .step { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; padding: 6px 10px; border-top: 1px solid #21262d; }
  .step:first-of-type { border-top: 0; }
  .step .label { overflow-wrap: anywhere; }
  .step .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .bar { grid-column: 1 / -1; height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: #388bfd; }
  .sub { grid-column: 1 / -1; color: #8b949e; font-size: 12px; }
  .kv { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding: 4px 10px; border-top: 1px solid #21262d; }
  .kv span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; padding: 8px 10px; border-bottom: 1px solid #21262d; }
  input, select, button { font: inherit; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 4px; padding: 2px 6px; }
  button { background: #21262d; cursor: pointer; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 8px; border-top: 1px solid #21262d; text-align: left; white-space: nowrap; vertical-align: top; }
  th { color: #8b949e; font-weight: 400; position: sticky; top: 0; background: #0d1117; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.player { cursor: pointer; }
  tr.player:hover td { background: #161b22; }
  .yes { color: #3fb950; }
  .no { color: #484f58; }
  .tag { font-size: 11px; padding: 0 6px; border-radius: 8px; background: #21262d; color: #8b949e; }
  .tag.new { background: #1d2d1d; color: #3fb950; }
  tr.detail td { white-space: normal; background: #161b22; }
  /* keep the drill-down readable on phones, where the table itself scrolls sideways */
  tr.detail td > * { position: sticky; left: 8px; max-width: min(720px, calc(100vw - 72px)); }
  .timeline { margin: 4px 0 8px; padding-left: 16px; }
  .timeline li { margin: 2px 0; }
</style>
</head>
<body>
<header>
  <h1>player insights</h1>
  <label class="meta">window
    <select id="days">
      <option value="1">24h</option>
      <option value="7" selected>7 days</option>
      <option value="30">30 days</option>
      <option value="90">90 days</option>
    </select>
  </label>
  <button id="refresh">refresh</button>
  <span class="meta" id="status">loading…</span>
  <span class="err" id="error"></span>
  <a id="admin-link" href="/admin">admin index</a>
</header>
<main>
  <div class="cards">
    <section><h2>Sign-up funnel</h2><p class="note">Anonymous visitors to the play client, deduped per browser. Landing-page visitors who never click Play are not visible.</p><div id="acquisition"></div></section>
    <section><h2>New players</h2><p class="note">Accounts created in the window. Times are medians from first sign-in.</p><div id="cohort"></div></section>
    <section><h2>Sessions</h2><p class="note">A session is sign-in to last tab closed; reconnects within 2 minutes continue it.</p><div id="sessions"></div></section>
  </div>
  <section>
    <h2>Players</h2>
    <div class="controls">
      <input id="search" type="search" placeholder="search name or id" />
      <label><input id="new-only" type="checkbox" /> new accounts only</label>
      <span class="meta" id="player-count"></span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>player</th><th>first seen</th><th>last seen</th><th>sessions</th><th>total</th><th>longest</th><th>spawn</th><th>move</th><th>10 tiles</th><th>contact</th><th>interact</th></tr></thead>
      <tbody id="players"></tbody>
    </table></div>
  </section>
  <p class="meta" id="counters"></p>
</main>
<script>
const token = new URLSearchParams(location.search).get("token") || "";
const withToken = (path) => token ? path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token) : path;
document.getElementById("admin-link").href = withToken("/admin");
const el = (tag, attrs, children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (k === "text") node.textContent = v; else node.setAttribute(k, v);
  for (const child of children || []) node.append(child);
  return node;
};
const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) + "%" : "–";
const dur = (ms) => {
  if (ms === undefined || ms === null) return "–";
  const m = Math.round(ms / 60000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  return h < 48 ? h + "h " + (m % 60) + "m" : Math.round(h / 24) + "d";
};
const when = (at) => at ? new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
const steps = (target, rows) => {
  target.replaceChildren();
  const base = rows[0] ? rows[0].n : 0;
  let prev = base;
  for (const row of rows) {
    const bar = el("div", { class: "bar" }, [el("span", { style: "width:" + (base > 0 ? Math.min(100, (row.n / base) * 100) : 0) + "%" })]);
    const sub = [row.sub, row !== rows[0] ? pct(row.n, prev) + " of previous" : ""].filter(Boolean).join(" · ");
    target.append(el("div", { class: "step" }, [el("span", { class: "label", text: row.label }), el("span", { class: "num", text: String(row.n) }), bar, ...(sub ? [el("span", { class: "sub", text: sub })] : [])]));
    prev = row.n;
  }
};
const kv = (target, pairs) => {
  for (const [k, v] of pairs) target.append(el("div", { class: "kv" }, [el("span", { text: k }), el("span", { text: v })]));
};
const breakdown = (counts) => Object.entries(counts).map(([k, v]) => k + " " + v).join(", ");
const distribution = (target, title, d) => {
  target.append(el("div", { class: "kv" }, [el("strong", { text: title }), el("span", { text: d.count + " sessions" })]));
  kv(target, [["median length", dur(d.medianMs)], ["≥ 10 min", pct(d.atLeastMinutes[10], 1)], ["≥ 30 min", pct(d.atLeastMinutes[30], 1)], ["≥ 60 min", pct(d.atLeastMinutes[60], 1)]]);
};
const mark = (at, firstSeenAt) => at ? el("span", { class: "yes", text: "✓ +" + dur(at - firstSeenAt) }) : el("span", { class: "no", text: "·" });
let latest;
const renderPlayers = () => {
  if (!latest) return;
  const q = document.getElementById("search").value.trim().toLowerCase();
  const newOnly = document.getElementById("new-only").checked;
  const rows = latest.players.filter((p) => (!newOnly || p.accountNew) && (!q || (p.name || "").toLowerCase().includes(q) || p.playerId.toLowerCase().includes(q)));
  document.getElementById("player-count").textContent = rows.length + " players active in window";
  const body = document.getElementById("players");
  body.replaceChildren();
  for (const p of rows) {
    const nameCell = el("td", {}, [el("span", { text: p.name || p.playerId }), " ", ...(p.accountNew ? [el("span", { class: "tag new", text: "new" })] : [])]);
    const withWhom = (id, isAi) => id ? " with " + id + (isAi === true ? " (AI)" : isAi === false ? " (human)" : "") : "";
    const tr = el("tr", { class: "player" }, [nameCell, el("td", { text: when(p.firstSeenAt) }), el("td", { text: when(p.lastSeenAt) }), el("td", { class: "num", text: String(p.sessionCount) }), el("td", { class: "num", text: dur(p.totalSessionMs) }), el("td", { class: "num", text: dur(p.longestSessionMs) }), el("td", {}, [mark(p.spawnedAt, p.firstSeenAt)]), el("td", {}, [mark(p.firstMoveAt, p.firstSeenAt)]), el("td", {}, [mark(p.tenTilesAt, p.firstSeenAt)]), el("td", {}, [mark(p.firstContactAt, p.firstSeenAt)]), el("td", {}, [mark(p.firstInteractionAt, p.firstSeenAt)])]);
    const events = [
      [p.firstSeenAt, "first seen" + (p.accountNew ? " (new account)" : " (existing account — tracking began here)")],
      [p.spawnedAt, "spawned"],
      [p.firstMoveAt, "first move" + (p.firstMoveType ? ": " + p.firstMoveType : "")],
      [p.tenTilesAt, "reached 10 tiles"],
      [p.firstContactAt, "first contact" + withWhom(p.firstContactWith, p.firstContactIsAi)],
      [p.firstInteractionAt, "first interaction" + (p.firstInteractionType ? ": " + p.firstInteractionType : "") + withWhom(p.firstInteractionWith, p.firstInteractionIsAi)]
    ].filter(([at]) => at).sort((a, b) => a[0] - b[0]);
    const detail = el("tr", { class: "detail", hidden: "" }, [el("td", { colspan: "11" }, [
      el("div", { class: "meta", text: p.playerId }),
      el("ol", { class: "timeline" }, events.map(([at, label]) => el("li", { text: when(at) + " (+" + dur(at - p.firstSeenAt) + ") · " + label }))),
      el("div", { class: "meta", text: "Recent sessions (first session " + dur(p.firstSessionMs) + ")" }),
      el("ol", { class: "timeline" }, p.recentSessions.map((s) => el("li", { text: when(s.startedAt) + " · " + dur(s.endedAt - s.startedAt) })))
    ])]);
    tr.addEventListener("click", () => { detail.hidden = !detail.hidden; });
    body.append(tr, detail);
  }
};
const render = (data) => {
  const { insights, counters } = data;
  latest = insights;
  const a = insights.acquisition;
  steps(document.getElementById("acquisition"), [
    { label: "Opened the play client", n: a.visitors, sub: a.fromLanding + " came from borderempires.com" },
    { label: "Saw the sign-in form", n: a.formShown },
    { label: "Clicked a sign-in method", n: a.methodClicked, sub: breakdown(a.methods) },
    { label: "Created an account", n: a.signUps }
  ]);
  const c = insights.cohort;
  steps(document.getElementById("cohort"), [
    { label: "New accounts", n: c.newAccounts },
    { label: "Spawned", n: c.spawned, sub: "median " + dur(c.medianMsToSpawn) },
    { label: "Made a first move", n: c.firstMove, sub: "median " + dur(c.medianMsToFirstMove) },
    { label: "Reached 10 tiles", n: c.tenTiles, sub: "median " + dur(c.medianMsToTenTiles) },
    { label: "First contact (borders touch)", n: c.firstContact, sub: "median " + dur(c.medianMsToFirstContact) + " · " + c.firstContactWithHuman + " with a human" },
    { label: "Interacted (attack / truce / alliance)", n: c.firstInteraction, sub: "median " + dur(c.medianMsToFirstInteraction) + (Object.keys(c.interactionTypes).length ? " · " + breakdown(c.interactionTypes) : "") }
  ]);
  const s = document.getElementById("sessions");
  s.replaceChildren();
  distribution(s, "New players' first session", c.firstSession);
  distribution(s, "All sessions in window", insights.allSessions);
  renderPlayers();
  document.getElementById("counters").textContent = "beacons recorded " + counters.beaconRecorded + " · duplicate " + counters.beaconDuplicate + " · invalid " + counters.beaconInvalid + " · rate-limited " + counters.beaconRateLimited + " · milestones recorded " + counters.milestonesRecorded + " · store errors " + counters.storeErrors + " (since gateway start)";
  document.getElementById("status").textContent = "updated " + new Date(insights.generatedAt).toLocaleTimeString();
};
const load = async () => {
  const days = document.getElementById("days").value;
  document.getElementById("error").textContent = "";
  try {
    const response = await fetch(withToken("/admin/players/insights.json?days=" + days), { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "HTTP " + response.status);
    render(data);
  } catch (error) {
    document.getElementById("error").textContent = String(error.message || error);
    document.getElementById("status").textContent = "";
  }
};
document.getElementById("days").addEventListener("change", load);
document.getElementById("refresh").addEventListener("click", load);
document.getElementById("search").addEventListener("input", renderPlayers);
document.getElementById("new-only").addEventListener("change", renderPlayers);
load();
</script>
</body>
</html>
`;
