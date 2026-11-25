// Each sector server gets its own admin token, derived from one secret held by
// the hosting service and the sector id. Nothing has to be stored, and a token
// taken from one sector opens no other.
import { createHmac } from "node:crypto";

export const sectorAdminToken = (secret: string, sectorId: string): string =>
  createHmac("sha256", secret).update(`hosted-sector-admin:${sectorId}`).digest("base64url");
