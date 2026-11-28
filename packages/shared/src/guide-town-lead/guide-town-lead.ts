// The guide's town lead on the wire (PLAYER_UPDATE guideTownLead): the nearest unowned town while the
// player holds none, or null once they do. The simulation computes it (apps/simulation guide-town-lead/);
// the client's guide steers the scout drone toward it.
export type GuideTownLead = { x: number; y: number };

/** A lead from the wire, or null for anything that isn't one (including an explicit null). */
export const parseGuideTownLead = (value: unknown): GuideTownLead | null => {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" && Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
};

// The guide's camp lead (PLAYER_UPDATE guideCampLead): the nearest live Insurgent camp the player has never
// seen, or null. Same wire shape; the simulation computes it (apps/simulation scout-drone-camp-lead.ts).
export type GuideCampLead = GuideTownLead;
export const parseGuideCampLead = parseGuideTownLead;
