import type { FleetComposition, FleetWeaponEmphasis } from "../galaxy-fleet-config/galaxy-fleet-config.js";

// Fleets (§6/§12 v2a): blueprints and fleet orders. Mirrors
// galaxy-senate-store.ts's shape (authUid-keyed, InMemory + Sqlite
// implementations of the same interface).
export type GalaxyFleetBlueprint = {
  id: string;
  ownerAuthUid: string;
  name: string;
  composition: FleetComposition;
  weaponEmphasis: FleetWeaponEmphasis;
  createdAt: number;
};

export type CreateFleetBlueprintInput = {
  ownerAuthUid: string;
  name: string;
  composition: FleetComposition;
  weaponEmphasis: FleetWeaponEmphasis;
  createdAt: number;
};

export type GalaxyFleetOrderStatus = "TRAVELING" | "RESOLVED";

// RAID is the original v1 behavior: targetSeasonId is someone else's
// territory, and resolution runs resolveFleetRaid against it. GARRISON is
// a "hold at home" order -- targetSeasonId is one of the sender's own
// held territories, no combat resolution happens at all, and the order
// just marks itself RESOLVED (a standing garrison) once its build+travel
// time elapses. The route layer sets this from whether targetAuthUid
// resolves to the sender themselves; undefined on any pre-existing order
// (before this field existed) is treated as RAID, its original behavior.
export type GalaxyFleetOrderKind = "RAID" | "GARRISON";

export type GalaxyFleetOrderOutcome = {
  // True for a recon-only (Scout/Tanker) composition -- no damage was
  // dealt, revealedGarrison is the only useful field.
  reconOnly: boolean;
  damageDealt: number;
  garrisonAbsorbed: number;
  netDamage: number;
  stabilityBefore: number;
  stabilityAfter: number;
  // Only meaningful for a recon (Scout) order.
  revealedGarrison?: number;
  // True only for a GARRISON order's outcome -- every other field above is
  // meaningless zeros for it (see galaxy-fleet-scheduler.ts's early-return
  // for GARRISON orders).
  garrisoned?: boolean;
};

export type GalaxyFleetOrder = {
  id: string;
  ownerAuthUid: string;
  targetAuthUid: string;
  targetSeasonId: string;
  orderKind?: GalaxyFleetOrderKind;
  // The sender's own territory the fleet visually launches from in Space
  // View's 3D scene -- purely cosmetic (no gameplay effect reads this),
  // since there's no real spatial/distance model (see galaxy-fleet-config.ts's
  // travel-time comment). Undefined when the sender holds no territory of
  // their own at send time; the client falls back to a deterministic
  // off-map launch point hashed from ownerAuthUid in that case.
  originSeasonId?: string;
  composition: FleetComposition;
  weaponEmphasis: FleetWeaponEmphasis;
  sentAt: number;
  // When construction finishes and travel actually starts (§13's cost
  // implies real build time -- see galaxy-fleet-config.ts's
  // computeFleetBuildTimeMs comment). Undefined on a pre-existing order
  // (before this field existed); callers should fall back to `sentAt`
  // (i.e. treat it as having departed immediately) in that case.
  departsAt?: number;
  arrivesAt: number;
  status: GalaxyFleetOrderStatus;
  resolvedAt?: number;
  outcome?: GalaxyFleetOrderOutcome;
};

export type CreateFleetOrderInput = {
  ownerAuthUid: string;
  targetAuthUid: string;
  targetSeasonId: string;
  orderKind?: GalaxyFleetOrderKind;
  originSeasonId?: string;
  composition: FleetComposition;
  weaponEmphasis: FleetWeaponEmphasis;
  sentAt: number;
  departsAt?: number;
  arrivesAt: number;
};

export type GalaxyFleetStore = {
  saveBlueprint: (input: CreateFleetBlueprintInput) => Promise<GalaxyFleetBlueprint>;
  listBlueprints: (ownerAuthUid: string) => Promise<GalaxyFleetBlueprint[]>;
  // No-op (not an error) if the blueprint doesn't exist or belongs to a
  // different owner -- the caller (route layer) already filters by owner,
  // this is a defense-in-depth backstop, not the authorization check itself.
  deleteBlueprint: (id: string, ownerAuthUid: string) => Promise<void>;

  createOrder: (input: CreateFleetOrderInput) => Promise<GalaxyFleetOrder>;
  getOrder: (id: string) => Promise<GalaxyFleetOrder | undefined>;
  // Every order still en route whose arrivesAt has passed `now` -- what the
  // resolution scheduler polls each tick.
  getArrivedTravelingOrders: (now: number) => Promise<GalaxyFleetOrder[]>;
  listOrdersForOwner: (ownerAuthUid: string) => Promise<GalaxyFleetOrder[]>;
  // Every still-TRAVELING RAID order aimed at `targetAuthUid` -- the
  // "an enemy fleet is en route to your territory" signal. GARRISON orders
  // are excluded even though their targetAuthUid also equals the sender
  // (never a real inbound threat to warn anyone about); an order with no
  // orderKind at all (pre-dates the field) is treated as RAID, same
  // fallback the route layer already uses elsewhere.
  listIncomingOrders: (targetAuthUid: string) => Promise<GalaxyFleetOrder[]>;
  resolveOrder: (id: string, input: { resolvedAt: number; outcome: GalaxyFleetOrderOutcome }) => Promise<void>;
};

export class InMemoryGalaxyFleetStore implements GalaxyFleetStore {
  private readonly blueprints = new Map<string, GalaxyFleetBlueprint>();
  private readonly orders = new Map<string, GalaxyFleetOrder>();
  private nextBlueprintId = 1;
  private nextOrderId = 1;

  async saveBlueprint(input: CreateFleetBlueprintInput): Promise<GalaxyFleetBlueprint> {
    const id = `fleet-blueprint-${this.nextBlueprintId++}`;
    const blueprint: GalaxyFleetBlueprint = { id, ...input };
    this.blueprints.set(id, blueprint);
    return { ...blueprint };
  }

  async listBlueprints(ownerAuthUid: string): Promise<GalaxyFleetBlueprint[]> {
    return [...this.blueprints.values()]
      .filter((b) => b.ownerAuthUid === ownerAuthUid)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => ({ ...b }));
  }

  async deleteBlueprint(id: string, ownerAuthUid: string): Promise<void> {
    const existing = this.blueprints.get(id);
    if (existing?.ownerAuthUid === ownerAuthUid) this.blueprints.delete(id);
  }

  async createOrder(input: CreateFleetOrderInput): Promise<GalaxyFleetOrder> {
    const id = `fleet-order-${this.nextOrderId++}`;
    const order: GalaxyFleetOrder = { id, status: "TRAVELING", ...input };
    this.orders.set(id, order);
    return { ...order };
  }

  async getOrder(id: string): Promise<GalaxyFleetOrder | undefined> {
    const existing = this.orders.get(id);
    return existing ? { ...existing } : undefined;
  }

  async getArrivedTravelingOrders(now: number): Promise<GalaxyFleetOrder[]> {
    return [...this.orders.values()].filter((o) => o.status === "TRAVELING" && o.arrivesAt <= now).map((o) => ({ ...o }));
  }

  async listOrdersForOwner(ownerAuthUid: string): Promise<GalaxyFleetOrder[]> {
    return [...this.orders.values()]
      .filter((o) => o.ownerAuthUid === ownerAuthUid)
      .sort((a, b) => b.sentAt - a.sentAt)
      .map((o) => ({ ...o }));
  }

  async listIncomingOrders(targetAuthUid: string): Promise<GalaxyFleetOrder[]> {
    return [...this.orders.values()]
      .filter((o) => o.targetAuthUid === targetAuthUid && o.status === "TRAVELING" && (o.orderKind ?? "RAID") === "RAID")
      .sort((a, b) => a.arrivesAt - b.arrivesAt)
      .map((o) => ({ ...o }));
  }

  async resolveOrder(id: string, input: { resolvedAt: number; outcome: GalaxyFleetOrderOutcome }): Promise<void> {
    const existing = this.orders.get(id);
    if (!existing) return;
    this.orders.set(id, { ...existing, status: "RESOLVED", resolvedAt: input.resolvedAt, outcome: input.outcome });
  }
}
