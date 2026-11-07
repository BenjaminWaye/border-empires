// POST /admin/agent-token?ttlHours=24 — mints a read-only agent token (see
// admin-auth/admin-agent-token.ts) for the signed-in admin to hand to a coding
// agent. Only the static token or a recent Google sign-in by the admin may
// call it.
import type { FastifyInstance } from "fastify";

import type { AdminHttpRequest } from "../admin-auth/admin-auth.js";
import { ADMIN_AGENT_TOKEN_TTL_HOURS, DEFAULT_ADMIN_AGENT_TOKEN_TTL_HOURS, type AdminAgentTokens } from "../admin-auth/admin-agent-token.js";

export type RegisterAdminAgentTokenRouteDeps = {
  adminMintAuthorized: (request: AdminHttpRequest) => Promise<boolean>;
  agentTokens: AdminAgentTokens;
};

export const registerAdminAgentTokenRoute = (app: FastifyInstance, deps: RegisterAdminAgentTokenRouteDeps): void => {
  app.post("/admin/agent-token", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(await deps.adminMintAuthorized(request))) {
      reply.code(401);
      return { ok: false, error: "unauthorized" };
    }
    if (!deps.agentTokens.enabled) {
      reply.code(503);
      return { ok: false, error: "agent tokens are disabled: ADMIN_API_TOKEN is not configured on this server" };
    }
    const raw = (request.query as { ttlHours?: string } | undefined)?.ttlHours;
    const ttlHours = raw === undefined ? DEFAULT_ADMIN_AGENT_TOKEN_TTL_HOURS : Number(raw);
    const minted = deps.agentTokens.mint(ttlHours);
    if (!minted) {
      reply.code(400);
      return { ok: false, error: `ttlHours must be one of ${ADMIN_AGENT_TOKEN_TTL_HOURS.join(", ")}` };
    }
    // Audit trail: the nonce identifies the token without being usable as it.
    request.log.info({ nonce: minted.nonce, expiresAt: minted.expiresAt, ttlHours }, "admin agent token minted");
    return { ok: true, token: minted.token, expiresAt: minted.expiresAt, readOnly: true };
  });
};
