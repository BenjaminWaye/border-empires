export type StoredAuthIdentityBinding = {
  uid: string;
  playerId: string;
  email?: string;
  updatedAt: number;
};

export type GatewayAuthBindingStore = {
  getByUid: (uid: string) => Promise<StoredAuthIdentityBinding | undefined>;
  bindIdentity: (binding: { uid: string; playerId: string; email?: string }) => Promise<StoredAuthIdentityBinding>;
};

export class InMemoryGatewayAuthBindingStore implements GatewayAuthBindingStore {
  private readonly bindingsByUid = new Map<string, StoredAuthIdentityBinding>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async getByUid(uid: string): Promise<StoredAuthIdentityBinding | undefined> {
    const existing = this.bindingsByUid.get(uid);
    return existing ? { ...existing } : undefined;
  }

  async bindIdentity(binding: { uid: string; playerId: string; email?: string }): Promise<StoredAuthIdentityBinding> {
    const now = this.now();
    const existing = this.bindingsByUid.get(binding.uid);
    if (existing) {
      const updated: StoredAuthIdentityBinding = {
        ...existing,
        ...(binding.email ? { email: binding.email } : {}),
        updatedAt: now
      };
      this.bindingsByUid.set(binding.uid, updated);
      return { ...updated };
    }

    const created: StoredAuthIdentityBinding = {
      uid: binding.uid,
      playerId: binding.playerId,
      ...(binding.email ? { email: binding.email } : {}),
      updatedAt: now
    };
    this.bindingsByUid.set(binding.uid, created);
    return { ...created };
  }
}
