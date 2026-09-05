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
};

export type GalaxyFleetOrder = {
  id: string;
  ownerAuthUid: string;
  targetAuthUid: string;
  targetSeasonId: string;
  composition: FleetComposition;
  weaponEmphasis: FleetWeaponEmphasis;
  sentAt: number;
  arrivesAt: number;
  status: GalaxyFleetOrderStatus;
  resolvedAt?: number;
  outcome?: GalaxyFleetOrderOutcome;
};

export type CreateFleetOrderInput = {
  ownerAuthUid: string;
  targetAuthUid: string;
  targetSeasonId: string;
  composition: FleetComposition;
  weaponEmphasis: FleetWeaponEmphasis;
  sentAt: number;
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

  async resolveOrder(id: string, input: { resolvedAt: number; outcome: GalaxyFleetOrderOutcome }): Promise<void> {
    const existing = this.orders.get(id);
    if (!existing) return;
    this.orders.set(id, { ...existing, status: "RESOLVED", resolvedAt: input.resolvedAt, outcome: input.outcome });
  }
}
