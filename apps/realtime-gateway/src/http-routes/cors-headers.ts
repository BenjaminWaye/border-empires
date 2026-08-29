// Gateway-wide permissive CORS (the public HTTP surface has no
// cookie/session auth to protect -- bearer tokens are read explicitly per
// route). Extracted out of http-routes.ts (already over the file-line
// gate's 500-line budget and may not grow further -- see AGENTS.md's
// file-and-type-discipline rule) since this is a fully self-contained unit.
import type { FastifyInstance } from "fastify";

export const addCorsHeaders = (app: FastifyInstance): void => {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    return payload;
  });

  app.options("/*", async (_request, reply) => {
    reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
      .header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
      .code(204);
    return "";
  });
};
