// The hosting service's key to this gateway (HOSTING_SERVICE_TOKEN): it can
// grant or revoke a bought cosmetic and record a hosted sector's results, and
// nothing else, so the hosting service never holds ADMIN_API_TOKEN (owner
// decision, 2026-11-28; docs/cosmetics.md, docs/hosted-sectors-plan.md).
import { timingSafeEqual } from "node:crypto";

/** Shorter keys are refused at start: a guessable key here would hand out paid items. */
export const MIN_HOSTING_SERVICE_TOKEN_LENGTH = 32;

export const assertHostingServiceToken = (token: string): void => {
  if (token.length < MIN_HOSTING_SERVICE_TOKEN_LENGTH) throw new Error(`HOSTING_SERVICE_TOKEN must be at least ${MIN_HOSTING_SERVICE_TOKEN_LENGTH} characters`);
};

/** True when the Authorization header is exactly `Bearer <token>`; compared in constant time. */
export const hostingServiceAuthorized = (authorization: unknown, token: string): boolean => {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};
