import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";

/**
 * Structure builds whose tech is an AFC_MODULE Manifest require an active AFC
 * with that module installed. Tests that grant techIds directly (bypassing
 * research-time commissioning) add this tile so those builds stay reachable.
 * Placed at (1, 1), clear of the coordinates the structure tests use.
 */
export const afcModuleFixtureTile = (ownerId: string) => ({
  x: 1,
  y: 1,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  afc: {
    ownerId,
    status: "active" as const,
    activatedAt: 0,
    modules: [...techEntryById.values()].filter((tech) => tech.manifestCategory === "AFC_MODULE").map((tech) => tech.id)
  }
});
