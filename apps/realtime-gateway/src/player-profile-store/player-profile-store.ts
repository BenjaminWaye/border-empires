export type StoredPlayerProfile = {
  playerId: string;
  name?: string;
  tileColor?: string;
  // Optional 2-letter uppercase ISO country code (e.g. "US"), used to render
  // a flag emoji next to the player's name in the season lobby roster. Never
  // inferred -- unset means no flag is shown.
  countryFlag?: string;
  profileComplete?: boolean;
  // Season id (CurrentSeasonSummary.seasonId) the display name was last
  // actually changed in, once the player has completed initial setup — used
  // to throttle renames to once per season. Undefined until the player's
  // first post-setup rename.
  nameChangedSeasonId?: string;
  // Season id the tile color was last actually changed in, once the player
  // has completed initial setup — used to throttle color changes to once per
  // season. Undefined until the player's first post-setup color change.
  colorChangedSeasonId?: string;
  // Server-persisted hint/tutorial state (replaces client-only localStorage,
  // which was lost on a browser data clear or a different device). See
  // client-discovery-tips-storage.ts / client-onboarding-checklist-storage.ts.
  dismissedHints?: string[];
  hintsMuted?: boolean;
  onboardingChecklistCompleted?: boolean;
  // Season id (CurrentSeasonSummary.seasonId) the client last saw a tile
  // owned by a rival empire or barbarians in; gates the Stage Muster tile
  // action for that season only (client-muster-unlock.ts) -- mirrors
  // nameChangedSeasonId/colorChangedSeasonId's per-season scoping pattern.
  // Undefined until the player's first-ever enemy contact.
  musterUnlockedSeasonId?: string;
  // Per-category opt-out for gameplay email alerts (email-alerts.ts). Every
  // category defaults to on (undefined/missing == enabled) so existing
  // players see no behavior change until they visit the Email Notifications
  // settings page and flip a toggle off.
  emailNotificationPrefs?: EmailNotificationPrefs;
  // The newest personal-activity-timeline event the player has viewed (see
  // docs/activity-dashboard-plan.md 2.1) -- "the newest personal activity
  // the player has viewed," never last disconnect/login. Advanced only via
  // setActivitySeen's monotonic max(stored, acknowledged) merge, scoped to
  // seasonId so a new season never inherits an old season's unread state.
  lastActivitySeenAt?: number;
  lastActivitySeenSeasonId?: string;
  updatedAt: number;
};

export type EmailNotificationCategory =
  | "allianceRequest"
  | "allianceBreak"
  | "truceOffer"
  | "attackAlert"
  | "aetherPurgeAlert"
  | "seasonStart";

export type EmailNotificationPrefs = Partial<Record<EmailNotificationCategory, boolean>>;

export type HintStatePatch = {
  dismissedHints?: string[];
  hintsMuted?: boolean;
  onboardingChecklistCompleted?: boolean;
  musterUnlockedSeasonId?: string;
};

export type GatewayPlayerProfileStore = {
  get(playerId: string): Promise<StoredPlayerProfile | undefined>;
  getMany(playerIds: Iterable<string>): Promise<StoredPlayerProfile[]>;
  listAllNamed(): Promise<StoredPlayerProfile[]>;
  // colorChangedSeasonId, when passed, records the season the color changed
  // in (for the once-per-season throttle); omit it for the player's initial
  // profile setup, which doesn't consume that season's allowance.
  setTileColor(playerId: string, tileColor: string, colorChangedSeasonId?: string): Promise<StoredPlayerProfile>;
  // nameChangedSeasonId, when passed, records the season the rename happened
  // in (for the once-per-season throttle); omit it for the player's initial
  // profile setup, which doesn't consume that season's allowance.
  setProfile(playerId: string, name: string, tileColor: string, nameChangedSeasonId?: string, colorChangedSeasonId?: string): Promise<StoredPlayerProfile>;
  setCountryFlag(playerId: string, countryFlag: string): Promise<StoredPlayerProfile>;
  // Merges the given hint-state fields into the player's profile; omitted
  // fields keep their existing stored value.
  setHintState(playerId: string, patch: HintStatePatch): Promise<StoredPlayerProfile>;
  // Merges the given email-notification-preference fields into the player's
  // profile; omitted categories keep their existing stored value (default on).
  setEmailNotificationPrefs(playerId: string, patch: EmailNotificationPrefs): Promise<StoredPlayerProfile>;
  // Advances the player's activity-seen watermark. If seasonId differs from
  // the stored one, overwrites outright (a new season starts fresh); if it
  // matches, stores max(stored lastActivitySeenAt, seenAtMs) so two devices
  // acknowledging concurrently can't move the watermark backwards. The
  // caller (handleAcknowledgeActivitySeenMessage) has already validated
  // seenAtMs isn't in the future and seasonId matches the current season.
  setActivitySeen(playerId: string, seenAtMs: number, seasonId: string): Promise<StoredPlayerProfile>;
};

export class InMemoryGatewayPlayerProfileStore implements GatewayPlayerProfileStore {
  private readonly profiles = new Map<string, StoredPlayerProfile>();

  async get(playerId: string): Promise<StoredPlayerProfile | undefined> {
    const profile = this.profiles.get(playerId);
    return profile ? { ...profile } : undefined;
  }

  async getMany(playerIds: Iterable<string>): Promise<StoredPlayerProfile[]> {
    const profiles: StoredPlayerProfile[] = [];
    const seen = new Set<string>();
    for (const playerId of playerIds) {
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      const profile = this.profiles.get(playerId);
      if (profile) profiles.push({ ...profile });
    }
    return profiles;
  }

  async listAllNamed(): Promise<StoredPlayerProfile[]> {
    return [...this.profiles.values()].filter((p) => p.name && p.name.length > 0).map((p) => ({ ...p }));
  }

  async setTileColor(playerId: string, tileColor: string, colorChangedSeasonId?: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const resolvedSeasonId = colorChangedSeasonId ?? existing?.colorChangedSeasonId;
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      tileColor,
      ...(existing?.countryFlag ? { countryFlag: existing.countryFlag } : {}),
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      ...(existing?.nameChangedSeasonId ? { nameChangedSeasonId: existing.nameChangedSeasonId } : {}),
      ...(resolvedSeasonId ? { colorChangedSeasonId: resolvedSeasonId } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setProfile(playerId: string, name: string, tileColor: string, nameChangedSeasonId?: string, colorChangedSeasonId?: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const resolvedNameSeasonId = nameChangedSeasonId ?? existing?.nameChangedSeasonId;
    const resolvedColorSeasonId = colorChangedSeasonId ?? existing?.colorChangedSeasonId;
    const updated: StoredPlayerProfile = {
      playerId,
      name,
      tileColor,
      ...(existing?.countryFlag ? { countryFlag: existing.countryFlag } : {}),
      profileComplete: true,
      ...(resolvedNameSeasonId ? { nameChangedSeasonId: resolvedNameSeasonId } : {}),
      ...(resolvedColorSeasonId ? { colorChangedSeasonId: resolvedColorSeasonId } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setCountryFlag(playerId: string, countryFlag: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      ...(existing?.tileColor ? { tileColor: existing.tileColor } : {}),
      countryFlag,
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      ...(existing?.nameChangedSeasonId ? { nameChangedSeasonId: existing.nameChangedSeasonId } : {}),
      ...(existing?.colorChangedSeasonId ? { colorChangedSeasonId: existing.colorChangedSeasonId } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setHintState(playerId: string, patch: HintStatePatch): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      ...(existing?.tileColor ? { tileColor: existing.tileColor } : {}),
      ...(existing?.countryFlag ? { countryFlag: existing.countryFlag } : {}),
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      ...(existing?.nameChangedSeasonId ? { nameChangedSeasonId: existing.nameChangedSeasonId } : {}),
      ...(existing?.colorChangedSeasonId ? { colorChangedSeasonId: existing.colorChangedSeasonId } : {}),
      ...(patch.dismissedHints ? { dismissedHints: patch.dismissedHints } : existing?.dismissedHints ? { dismissedHints: existing.dismissedHints } : {}),
      ...(typeof patch.hintsMuted === "boolean"
        ? { hintsMuted: patch.hintsMuted }
        : typeof existing?.hintsMuted === "boolean" ? { hintsMuted: existing.hintsMuted } : {}),
      ...(typeof patch.onboardingChecklistCompleted === "boolean"
        ? { onboardingChecklistCompleted: patch.onboardingChecklistCompleted }
        : typeof existing?.onboardingChecklistCompleted === "boolean" ? { onboardingChecklistCompleted: existing.onboardingChecklistCompleted } : {}),
      ...(patch.musterUnlockedSeasonId
        ? { musterUnlockedSeasonId: patch.musterUnlockedSeasonId }
        : existing?.musterUnlockedSeasonId ? { musterUnlockedSeasonId: existing.musterUnlockedSeasonId } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setEmailNotificationPrefs(playerId: string, patch: EmailNotificationPrefs): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const mergedPrefs = { ...existing?.emailNotificationPrefs, ...patch };
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      ...(existing?.tileColor ? { tileColor: existing.tileColor } : {}),
      ...(existing?.countryFlag ? { countryFlag: existing.countryFlag } : {}),
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      ...(existing?.nameChangedSeasonId ? { nameChangedSeasonId: existing.nameChangedSeasonId } : {}),
      ...(existing?.colorChangedSeasonId ? { colorChangedSeasonId: existing.colorChangedSeasonId } : {}),
      ...(existing?.dismissedHints ? { dismissedHints: existing.dismissedHints } : {}),
      ...(typeof existing?.hintsMuted === "boolean" ? { hintsMuted: existing.hintsMuted } : {}),
      ...(typeof existing?.onboardingChecklistCompleted === "boolean" ? { onboardingChecklistCompleted: existing.onboardingChecklistCompleted } : {}),
      ...(existing?.musterUnlockedSeasonId ? { musterUnlockedSeasonId: existing.musterUnlockedSeasonId } : {}),
      emailNotificationPrefs: mergedPrefs,
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setActivitySeen(playerId: string, seenAtMs: number, seasonId: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const sameSeason = existing?.lastActivitySeenSeasonId === seasonId;
    const lastActivitySeenAt = sameSeason ? Math.max(existing?.lastActivitySeenAt ?? 0, seenAtMs) : seenAtMs;
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      ...(existing?.tileColor ? { tileColor: existing.tileColor } : {}),
      ...(existing?.countryFlag ? { countryFlag: existing.countryFlag } : {}),
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      ...(existing?.nameChangedSeasonId ? { nameChangedSeasonId: existing.nameChangedSeasonId } : {}),
      ...(existing?.colorChangedSeasonId ? { colorChangedSeasonId: existing.colorChangedSeasonId } : {}),
      ...(existing?.dismissedHints ? { dismissedHints: existing.dismissedHints } : {}),
      ...(typeof existing?.hintsMuted === "boolean" ? { hintsMuted: existing.hintsMuted } : {}),
      ...(typeof existing?.onboardingChecklistCompleted === "boolean" ? { onboardingChecklistCompleted: existing.onboardingChecklistCompleted } : {}),
      ...(existing?.musterUnlockedSeasonId ? { musterUnlockedSeasonId: existing.musterUnlockedSeasonId } : {}),
      ...(existing?.emailNotificationPrefs ? { emailNotificationPrefs: existing.emailNotificationPrefs } : {}),
      lastActivitySeenAt,
      lastActivitySeenSeasonId: seasonId,
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }
}
