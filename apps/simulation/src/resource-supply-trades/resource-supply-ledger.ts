import {
  allocateResourceSupplyAgreements, MAX_RESOURCE_SUPPLY_AGREEMENTS, MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER,
  ResourceSupplyAgreementSchema, type ResourceSupplyAgreement, type ResourceSupplyAllocation, type ResourceSupplyCapacity
} from "@border-empires/shared";

export type SupplyLedgerResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type ResourceSupplyLedgerContext = {
  readonly publish?: (participantIds: readonly string[]) => void;
  readonly capacityRejected?: () => void;
  readonly capacityFor: ResourceSupplyCapacity;
  /** Settle every affected participant at the old rates before changing supply. */
  readonly beforeChange: (at: number, participantIds: readonly string[]) => void;
  readonly invalidate: (participantIds: readonly string[]) => void;
  readonly changed: (action: "created" | "cancelled" | "expired", agreement: ResourceSupplyAgreement) => void;
};

/** Active state only: bounded globally and per player, with expiry-aware allocation. */
export class ResourceSupplyLedger {
  private readonly agreements = new Map<string, ResourceSupplyAgreement>();
  private cached: ResourceSupplyAllocation | undefined;
  private cachedAt: number | undefined;
  private cachedUntil = Infinity;
  private advancing = false;
  private valuationTime: number | undefined;

  constructor(private readonly context: ResourceSupplyLedgerContext, restored: readonly ResourceSupplyAgreement[] = []) {
    if (restored.length > MAX_RESOURCE_SUPPLY_AGREEMENTS) throw new RangeError("Too many saved resource agreements");
    for (const raw of restored) {
      const row = ResourceSupplyAgreementSchema.parse(raw);
      if (this.agreements.has(row.id) || !this.hasCapacity(row)) throw new Error("Invalid saved resource agreement capacity or identity");
      this.agreements.set(row.id, row);
    }
  }
  get size(): number { return this.agreements.size; }
  rows(): readonly ResourceSupplyAgreement[] {
    return [...this.agreements.values()].map(row => ({ ...row, proposerGives: { ...row.proposerGives }, targetGives: { ...row.targetGives } }));
  }
  participantIds(): readonly string[] {
    return [...new Set(this.rows().flatMap(row => [row.proposerId, row.targetId]))];
  }
  /** Only a connected chain of supply contracts can transmit a shortage. */
  affectedParticipantIds(seeds: readonly string[]): readonly string[] {
    const affected = new Set(seeds);
    for (let pass = 0; pass <= this.size; pass += 1) {
      const previousSize = affected.size;
      for (const row of this.agreements.values()) if (affected.has(row.proposerId) || affected.has(row.targetId)) {
        affected.add(row.proposerId); affected.add(row.targetId);
      }
      if (affected.size === previousSize) break;
    }
    return [...affected];
  }
  invalidate(): void { this.cached = undefined; this.cachedAt = undefined; this.cachedUntil = Infinity; }
  private hasCapacity(row: ResourceSupplyAgreement): boolean {
    if (this.size >= MAX_RESOURCE_SUPPLY_AGREEMENTS) return false;
    for (const id of [row.proposerId, row.targetId]) {
      let count = 0;
      for (const entry of this.agreements.values()) if (entry.proposerId === id || entry.targetId === id) count += 1;
      if (count >= MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER) return false;
    }
    return true;
  }
  private settleBeforeChange(at: number, ids: readonly string[]): void {
    const previous = this.valuationTime;
    this.valuationTime = at;
    try { this.context.beforeChange(at, ids); } finally { this.valuationTime = previous; }
  }
  private notifyInvalidation(ids: readonly string[]): void {
    this.invalidate(); this.context.invalidate(ids); this.context.publish?.(ids);
  }
  advanceTo(now: number): void {
    if (this.advancing || this.valuationTime !== undefined) return;
    this.advancing = true;
    try {
      // Each pass removes at least one agreement; bounded by the global cap.
      for (let pass = 0; pass < MAX_RESOURCE_SUPPLY_AGREEMENTS; pass += 1) {
        const next = this.rows().filter(row => row.expiresAt !== undefined && row.expiresAt <= now)
          .sort((a, b) => a.expiresAt! - b.expiresAt!)[0];
        if (!next?.expiresAt) break;
        const deadline = next.expiresAt, ids = this.affectedParticipantIds(this.rows().filter(row => row.expiresAt !== undefined && row.expiresAt <= next.expiresAt!).flatMap(row => [row.proposerId, row.targetId]));
        // The preceding interval uses the agreement until its exact deadline.
        this.valuationTime = deadline - 1; this.invalidate();
        this.context.beforeChange(deadline, ids);
        for (const row of this.rows()) if (row.expiresAt !== undefined && row.expiresAt <= deadline) {
          this.agreements.delete(row.id); this.context.changed("expired", row);
        }
        this.valuationTime = undefined; this.notifyInvalidation(ids);
      }
    } finally { this.advancing = false; this.valuationTime = undefined; }
  }
  allocation(now: number): ResourceSupplyAllocation {
    this.advanceTo(this.valuationTime ?? now);
    const at = this.valuationTime ?? now;
    if (!this.cached || at < (this.cachedAt ?? at) || at >= this.cachedUntil) {
      this.cached = allocateResourceSupplyAgreements(this.rows(), at, this.context.capacityFor);
      this.cachedAt = at;
      this.cachedUntil = Math.min(Infinity, ...this.rows().flatMap(row => [row.startedAt, row.expiresAt ?? Infinity]).filter(deadline => deadline > at));
    }
    return this.cached;
  }
  preview(row: ResourceSupplyAgreement, now: number): ResourceSupplyAllocation {
    this.advanceTo(now);
    return allocateResourceSupplyAgreements([...this.rows(), row], now, this.context.capacityFor);
  }
  add(raw: ResourceSupplyAgreement, now: number): SupplyLedgerResult {
    this.advanceTo(now);
    const parsed = ResourceSupplyAgreementSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: "Invalid resource supply agreement." };
    const row = parsed.data;
    if (this.agreements.has(row.id)) return { ok: false, message: "This resource agreement already exists." };
    if (!this.hasCapacity(row)) { this.context.capacityRejected?.(); return { ok: false, message: "Too many active resource agreements." }; }
    const before = this.allocation(now), after = this.preview(row, now);
    if (!after.fulfilled.has(row.id) || [...before.fulfilled].some(id => !after.fulfilled.has(id)))
      return { ok: false, message: "The promised resource supply is no longer available." };
    const ids = this.affectedParticipantIds([row.proposerId, row.targetId]);
    this.settleBeforeChange(now, ids);
    this.agreements.set(row.id, row); this.context.changed("created", row); this.notifyInvalidation(ids);
    return { ok: true };
  }
  /** Caller authorises ordinary cancellation or a trusted settlement rollback. */
  remove(id: string, now: number): boolean {
    this.advanceTo(now);
    const row = this.agreements.get(id);
    if (!row) return false;
    const ids = this.affectedParticipantIds([row.proposerId, row.targetId]);
    this.settleBeforeChange(now, ids);
    this.agreements.delete(id); this.context.changed("cancelled", row); this.notifyInvalidation(ids);
    return true;
  }
}
