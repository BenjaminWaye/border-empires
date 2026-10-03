// Single source of truth for the GET /admin navigation page.
//
// Every /admin/* route the gateway registers must have an entry here —
// admin-page-routes.test.ts enumerates the registered routes and fails if one
// is missing, so the nav page can't silently drift out of date as new admin
// endpoints land. Simulation loopback endpoints and external consoles aren't
// gateway routes, so they're listed by hand below.

// "read"   — adminRequestAuthorized: ADMIN_API_TOKEN (Bearer or ?token=) or a
//            GitHub token with repo access (X-Admin-Github-Token header).
// "static" — adminAuthorized: Bearer ADMIN_API_TOKEN header only (destructive).
// "none"   — public.
export type AdminRouteAuth = "read" | "static" | "none";

// "page" renders HTML, "json"/"text" are raw responses, "action" mutates state.
export type AdminRouteKind = "page" | "json" | "text" | "action";

export type AdminRouteParam = {
  name: string;
  hint: string;
};

export type AdminRouteEntry = {
  method: "GET" | "POST";
  path: string;
  kind: AdminRouteKind;
  auth: AdminRouteAuth;
  title: string;
  description: string;
  params?: AdminRouteParam[];
};

export type AdminRouteSection = {
  heading: string;
  note?: string;
  routes: AdminRouteEntry[];
};

export const ADMIN_ROUTE_SECTIONS: AdminRouteSection[] = [
  {
    heading: "Dashboards",
    routes: [
      {
        method: "GET",
        path: "/admin",
        kind: "page",
        auth: "read",
        title: "Admin index",
        description: "This page."
      },
      {
        method: "GET",
        path: "/admin/runtime/dashboard",
        kind: "page",
        auth: "read",
        title: "Runtime dashboard",
        description: "Live gateway + simulation Prometheus gauges grouped by subsystem, auto-refreshing."
      },
      {
        method: "GET",
        path: "/admin/players/insights",
        kind: "page",
        auth: "read",
        title: "Player insights",
        description: "Sign-up funnel, new-player milestones (spawn, first move, 10 tiles, contact, interaction), session lengths, and per-player timelines."
      }
    ]
  },
  {
    heading: "Players & AI",
    routes: [
      {
        method: "GET",
        path: "/admin/players",
        kind: "json",
        auth: "read",
        title: "Players",
        description: "Every player in the current season: gold, income, tiles, techs, AI flag."
      },
      {
        method: "GET",
        path: "/admin/players/insights.json",
        kind: "json",
        auth: "read",
        title: "Player insights data",
        description: "Raw data behind the player insights page.",
        params: [{ name: "days", hint: "7 (1–90)" }]
      },
      {
        method: "GET",
        path: "/admin/debug/ai",
        kind: "json",
        auth: "read",
        title: "AI players",
        description: "AI player economy, manpower (vs cap) and territory plus their last five commands."
      },
      {
        method: "GET",
        path: "/admin/debug/ai/decisions",
        kind: "json",
        auth: "read",
        title: "AI decisions",
        description: "Recent planner decision diagnostics (roughly the last minute).",
        params: [{ name: "playerId", hint: "ai-2 (optional)" }]
      },
      {
        method: "GET",
        path: "/admin/debug/ai/recording-status",
        kind: "json",
        auth: "read",
        title: "AI recording status",
        description: "Whether AI decision diagnostics are being recorded at all."
      }
    ]
  },
  {
    heading: "Runtime diagnostics",
    routes: [
      {
        method: "GET",
        path: "/admin/runtime/metrics",
        kind: "text",
        auth: "read",
        title: "Combined metrics",
        description: "Gateway Prometheus text plus the simulation's, proxied from loopback."
      },
      {
        method: "GET",
        path: "/admin/runtime/debug-bundle",
        kind: "json",
        auth: "read",
        title: "Debug bundle",
        description: "Health, recent server events, attack traces and sim phase diagnostics."
      }
    ]
  },
  {
    heading: "Ops actions",
    note: "Destructive. Bearer ADMIN_API_TOKEN header only — the ?token= and GitHub paths are refused.",
    routes: [
      {
        method: "POST",
        path: "/admin/season/start-next",
        kind: "action",
        auth: "static",
        title: "Start next season",
        description: "Wipes the current season and applies new worldgen. Refuses while the season is active unless forced.",
        params: [{ name: "force", hint: "true" }]
      },
      {
        method: "POST",
        path: "/admin/barbarians/seed",
        kind: "action",
        auth: "static",
        title: "Seed barbarians",
        description: "Non-destructively reintroduces barbarians into the live world.",
        params: [{ name: "count", hint: "defaults to INITIAL_BARBARIAN_COUNT" }]
      }
    ]
  },
  {
    heading: "Public health",
    routes: [
      { method: "GET", path: "/health", kind: "json", auth: "none", title: "Health", description: "Readiness: 503 until the simulation is connected." },
      { method: "GET", path: "/healthz", kind: "json", auth: "none", title: "Liveness", description: "Always 200; readiness nested inside." },
      { method: "GET", path: "/metrics", kind: "text", auth: "none", title: "Gateway metrics", description: "Gateway-only Prometheus text." }
    ]
  }
];

export type SimLoopbackEndpoint = {
  path: string;
  description: string;
};

// Served by the simulation's loopback HTTP server (127.0.0.1:50052), which is
// never exposed outside the container. The container has no curl.
export const SIM_LOOPBACK_PORT = 50052;

export const SIM_LOOPBACK_ENDPOINTS: SimLoopbackEndpoint[] = [
  { path: "/debug/players?ai=1", description: "Simulation-side player debug snapshot (drop ?ai=1 for humans too)." },
  { path: "/debug/ai-diagnostics", description: "Per-AI recent utility winners, noop/preplan reasons, last accepted command." },
  { path: "/debug/heap-stats", description: "Cheap heap-space breakdown; safe to poll." },
  { path: "/debug/cpu-profile?ms=5000", description: "Sampling CPU profile of the sim thread (max 60s)." },
  { path: "/debug/heap-snapshot", description: "Writes a .heapsnapshot to /data. Pauses the loop — avoid near the heap ceiling." }
];

export type AdminEnvironment = {
  label: string;
  flyApp: string;
  gatewayOrigin: string;
  playOrigin: string;
};

export const ADMIN_ENVIRONMENTS: AdminEnvironment[] = [
  {
    label: "Production",
    flyApp: "border-empires-combined",
    gatewayOrigin: "https://api.borderempires.com",
    playOrigin: "https://play.borderempires.com"
  },
  {
    label: "Staging",
    flyApp: "border-empires-combined-staging",
    gatewayOrigin: "https://api-staging.borderempires.com",
    playOrigin: "https://staging.borderempires.com"
  }
];

export type ExternalConsoleLink = {
  title: string;
  url: string;
  description: string;
};

export const EXTERNAL_CONSOLE_LINKS: ExternalConsoleLink[] = [
  { title: "Google Analytics", url: "https://analytics.google.com/", description: "Acquisition funnel (sign_up + UTM)." },
  { title: "Firebase console", url: "https://console.firebase.google.com/project/border-empires/overview", description: "Auth users and analytics property." },
  { title: "GitHub Actions", url: "https://github.com/BenjaminWaye/border-empires/actions", description: "CI and deploy workflows." },
  { title: "Vercel", url: "https://vercel.com/dashboard", description: "Client deployments." },
  { title: "Fly.io", url: "https://fly.io/dashboard", description: "Machines, logs, secrets." }
];
