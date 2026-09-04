// Shared by every galaxy-layer route module (galaxy-routes.ts,
// galaxy-endorsement-routes.ts, galaxy-senate-routes.ts) -- previously
// copy-pasted verbatim into each one.
export const bearerHeader = (request: { headers: Record<string, unknown> }): string | undefined =>
  typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
