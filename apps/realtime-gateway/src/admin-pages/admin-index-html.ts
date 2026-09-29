// Server-rendered GET /admin navigation page. Like runtime-dashboard-html.ts
// it is a self-contained HTML string with no build step, so it ships with the
// gateway and stays off the client-changelog hook.
//
// The page's own ?token= is forwarded onto every "read"-auth link by a tiny
// inline script, so bookmarking /admin?token=XYZ makes every link one click.
// The token is never forwarded to "static"-auth actions (those need the
// Bearer header) or to external links.

import {
  ADMIN_ENVIRONMENTS,
  ADMIN_ROUTE_SECTIONS,
  EXTERNAL_CONSOLE_LINKS,
  SIM_LOOPBACK_ENDPOINTS,
  SIM_LOOPBACK_PORT,
  type AdminRouteEntry,
  type AdminRouteSection
} from "./admin-page-catalog.js";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const AUTH_LABEL: Record<AdminRouteEntry["auth"], string> = {
  read: "token",
  static: "bearer only",
  none: "public"
};

const renderParamForm = (route: AdminRouteEntry): string => {
  const inputs = (route.params ?? [])
    .map(
      (param) =>
        `<label>${escapeHtml(param.name)} <input name="${escapeHtml(param.name)}" placeholder="${escapeHtml(param.hint)}" /></label>`
    )
    .join("");
  return `<form class="params" data-path="${escapeHtml(route.path)}">${inputs}<button type="submit">open</button></form>`;
};

const renderActionSnippet = (route: AdminRouteEntry): string => {
  const query = (route.params ?? []).map((param) => `${param.name}=…`).join("&");
  const suffix = query ? `?${query}` : "";
  return `<code class="snippet" data-origin-snippet>curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" "{origin}${escapeHtml(route.path + suffix)}"</code>`;
};

const renderRoute = (route: AdminRouteEntry): string => {
  const isLink = route.method === "GET";
  const titleHtml = isLink
    ? `<a href="${escapeHtml(route.path)}"${route.auth === "read" ? " data-token-forward" : ""}>${escapeHtml(route.title)}</a>`
    : `<span>${escapeHtml(route.title)}</span>`;
  const extra = route.kind === "action" ? renderActionSnippet(route) : route.params?.length ? renderParamForm(route) : "";
  return `<li>
  <div class="row">${titleHtml}<span class="tag kind-${route.kind}">${route.kind}</span><span class="tag auth-${route.auth}">${AUTH_LABEL[route.auth]}</span></div>
  <div class="path">${route.method} ${escapeHtml(route.path)}</div>
  <div class="desc">${escapeHtml(route.description)}</div>
  ${extra}
</li>`;
};

const renderSection = (section: AdminRouteSection): string => `<section>
<h2>${escapeHtml(section.heading)}</h2>
${section.note ? `<p class="note">${escapeHtml(section.note)}</p>` : ""}
<ul>${section.routes.map(renderRoute).join("")}</ul>
</section>`;

const renderSimLoopbackSection = (): string => {
  const items = SIM_LOOPBACK_ENDPOINTS.map((endpoint) => {
    const url = `http://127.0.0.1:${SIM_LOOPBACK_PORT}${endpoint.path}`;
    const command = `flyctl ssh console -a {flyApp} -C "node -e \\"fetch('${url}').then(r=>r.text()).then(console.log)\\""`;
    return `<li>
  <div class="path">GET ${escapeHtml(endpoint.path)}</div>
  <div class="desc">${escapeHtml(endpoint.description)}</div>
  <code class="snippet" data-fly-snippet>${escapeHtml(command)}</code>
</li>`;
  }).join("");
  return `<section>
<h2>Simulation loopback</h2>
<p class="note">Not reachable from the browser: 127.0.0.1:${SIM_LOOPBACK_PORT} inside the container, and the container has no curl.</p>
<ul>${items}</ul>
</section>`;
};

const renderLinksSection = (): string => {
  const envItems = ADMIN_ENVIRONMENTS.map(
    (env) => `<li>
  <div class="row"><a href="${escapeHtml(env.gatewayOrigin)}/admin">${escapeHtml(env.label)} admin</a><a href="${escapeHtml(env.playOrigin)}">play</a><a href="https://fly.io/apps/${escapeHtml(env.flyApp)}">fly</a></div>
  <div class="path">${escapeHtml(env.flyApp)}</div>
</li>`
  ).join("");
  const consoleItems = EXTERNAL_CONSOLE_LINKS.map(
    (link) => `<li>
  <div class="row"><a href="${escapeHtml(link.url)}" rel="noreferrer">${escapeHtml(link.title)}</a></div>
  <div class="desc">${escapeHtml(link.description)}</div>
</li>`
  ).join("");
  return `<section>
<h2>Environments</h2>
<p class="note">Tokens differ per environment, so they are not carried across.</p>
<ul>${envItems}</ul>
</section>
<section>
<h2>External consoles</h2>
<ul>${consoleItems}</ul>
</section>`;
};

const PAGE_SCRIPT = `
(() => {
  const token = new URLSearchParams(location.search).get("token") || "";
  const withToken = (href) => {
    if (!token) return href;
    const url = new URL(href, location.origin);
    url.searchParams.set("token", token);
    return url.pathname + url.search;
  };
  for (const a of document.querySelectorAll("a[data-token-forward]")) a.href = withToken(a.getAttribute("href"));
  for (const form of document.querySelectorAll("form.params")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const url = new URL(form.dataset.path, location.origin);
      for (const input of form.querySelectorAll("input")) if (input.value) url.searchParams.set(input.name, input.value);
      location.href = withToken(url.pathname + url.search);
    });
  }
  const env = ${JSON.stringify(ADMIN_ENVIRONMENTS.map((env) => ({ label: env.label, flyApp: env.flyApp, origin: env.gatewayOrigin })))};
  const current = env.find((e) => e.origin === location.origin);
  const badge = document.getElementById("env");
  badge.textContent = current ? current.label : location.host;
  if (current) badge.dataset.env = current.label.toLowerCase();
  const flyApp = current ? current.flyApp : "<fly-app>";
  for (const el of document.querySelectorAll("[data-origin-snippet]")) el.textContent = el.textContent.replace("{origin}", location.origin);
  for (const el of document.querySelectorAll("[data-fly-snippet]")) el.textContent = el.textContent.replace("{flyApp}", flyApp);
  if (!token) document.getElementById("token-hint").hidden = false;
  for (const el of document.querySelectorAll("code.snippet")) {
    el.title = "click to copy";
    el.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(el.textContent));
  }
})();
`;

export const renderAdminIndexHtml = (): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>border-empires · admin</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; background: #0d1117; color: #c9d1d9; }
  header { position: sticky; top: 0; background: #161b22; padding: 10px 16px; border-bottom: 1px solid #30363d; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  header h1 { font-size: 14px; margin: 0; font-weight: 600; }
  #env { padding: 1px 8px; border-radius: 10px; background: #30363d; font-weight: 600; }
  #env[data-env="production"] { background: #da3633; color: #fff; }
  #env[data-env="staging"] { background: #9e6a03; color: #fff; }
  #token-hint { color: #d29922; }
  main { padding: 12px 16px 48px; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 16px; align-items: start; }
  section { border: 1px solid #30363d; border-radius: 6px; overflow: hidden; min-width: 0; }
  h2 { font-size: 12px; margin: 0; padding: 6px 10px; background: #21262d; color: #58a6ff; text-transform: uppercase; letter-spacing: .04em; }
  .note { margin: 0; padding: 6px 10px; color: #d29922; border-bottom: 1px solid #21262d; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 8px 10px; border-top: 1px solid #21262d; }
  li:first-child { border-top: 0; }
  .row { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  a { color: #58a6ff; font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .path { color: #8b949e; overflow-wrap: anywhere; }
  .desc { margin-top: 2px; }
  .tag { font-size: 11px; padding: 0 6px; border-radius: 8px; background: #21262d; color: #8b949e; }
  .kind-action, .auth-static { background: #3d1d1d; color: #f85149; }
  .auth-none { background: #1d2d1d; color: #3fb950; }
  .snippet { display: block; margin-top: 6px; padding: 6px 8px; background: #161b22; border: 1px solid #30363d; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; cursor: copy; }
  .params { margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  input, button { font: inherit; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 4px; padding: 2px 6px; }
  button { background: #21262d; cursor: pointer; }
</style>
</head>
<body>
<header>
  <h1>border-empires admin</h1>
  <span id="env"></span>
  <span id="token-hint" hidden>No ?token= in the URL — links will 401 unless you add it.</span>
</header>
<main>
${ADMIN_ROUTE_SECTIONS.map(renderSection).join("\n")}
${renderSimLoopbackSection()}
${renderLinksSection()}
</main>
<script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
