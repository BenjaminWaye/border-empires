import type { FastifyInstance } from "fastify";

import type { AdminHttpRequest } from "../admin-auth/admin-auth.js";
import { RUNTIME_DASHBOARD_HTML } from "../runtime-dashboard-html.js";
import { renderAdminIndexHtml } from "./admin-index-html.js";

// Browser-facing admin pages: the /admin navigation index, the runtime
// dashboard, and the combined metrics text the dashboard polls. All are
// read-only and accept any adminRequestAuthorized credential (?token= works,
// so the pages can be bookmarked).
export type RegisterAdminPageRoutesDeps = {
  adminRequestAuthorized: (request: AdminHttpRequest) => Promise<boolean>;
  metrics: () => string;
  // Fetches the simulation's Prometheus metrics text from its loopback HTTP
  // server (127.0.0.1:50052 in the combined deployment). The sim metrics port
  // is never exposed externally, so the gateway proxies it for the runtime
  // dashboard / single scrape URL.
  getSimMetrics?: () => Promise<string>;
};

export const registerAdminPageRoutes = (app: FastifyInstance, deps: RegisterAdminPageRoutesDeps): void => {
  const adminIndexHtml = renderAdminIndexHtml();

  // Registered with and without the trailing slash: Fastify treats them as
  // distinct routes by default.
  for (const path of ["/admin", "/admin/"]) {
    app.get(path, async (request, reply) => {
      if (!(await deps.adminRequestAuthorized(request))) {
        reply.code(401);
        reply.header("Content-Type", "text/plain");
        return "unauthorized — open /admin?token=<ADMIN_API_TOKEN>\n";
      }
      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-store");
      return adminIndexHtml;
    });
  }

  // Single token-gated scrape URL combining gateway-side and (proxied) sim-side
  // Prometheus series, so AI-on vs AI-off staging runs can be compared from a
  // laptop without flyctl-ssh'ing the loopback :50052 metrics port.
  app.get("/admin/runtime/metrics", async (request, reply) => {
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      return "unauthorized\n";
    }
    reply.header("Content-Type", "text/plain; version=0.0.4");
    const gatewayText = deps.metrics();
    let simText = "# sim metrics proxy not wired\n";
    if (deps.getSimMetrics) {
      try {
        simText = await deps.getSimMetrics();
      } catch (error) {
        simText = `# sim metrics unreachable: ${error instanceof Error ? error.message : String(error)}\n`;
      }
    }
    return `${gatewayText}\n# ---- simulation metrics (proxied from loopback :50052) ----\n${simText}`;
  });

  app.get("/admin/runtime/dashboard", async (request, reply) => {
    if (!(await deps.adminRequestAuthorized(request))) {
      reply.code(401);
      reply.header("Content-Type", "text/plain");
      return "unauthorized\n";
    }
    reply.header("Content-Type", "text/html; charset=utf-8");
    return RUNTIME_DASHBOARD_HTML;
  });
};
