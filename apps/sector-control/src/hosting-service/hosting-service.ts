// What players can ask the hosting service to do: order a sector, invite
// friends, join, and enter. Everything that happens without a player (creating
// the server, retries, refunds, teardown) is in hosting-reconciler.ts.
import { HOSTED_SECTOR_MAP_SIZES, HOSTED_SECTOR_PRICE_USD_CENTS, type HostedSectorOptions } from "@border-empires/shared";

import type { HostingStore, SectorInvite, SectorRecord, SectorState } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider } from "../providers/providers.js";
import type { SectorTicketSigner } from "../sector-ticket/sector-ticket-signer.js";
import type { HostingConfig } from "./hosting-config.js";
import { consentRecord } from "./hosting-consent.js";
import { createFundingService, type ContributionEvent, type FundingErrorCode, type FundingView } from "./hosting-funding.js";

/** The signed-in caller, as verified from their Firebase ID token. */
export type HostingAccount = { uid: string; isGuest: boolean; emailVerified: boolean };

export type HostingErrorCode =
  | "SALES_CLOSED" | "ACCOUNT_REQUIRED" | "EMAIL_NOT_VERIFIED" | "ALREADY_HOSTING" | "PAYMENT_UNAVAILABLE"
  | "NOT_FOUND" | "NOT_HOST" | "NOT_MEMBER" | "SECTOR_CLOSED" | "SECTOR_NOT_READY" | "SECTOR_FULL"
  | "INVITE_INVALID" | "TOO_MANY_INVITES" | FundingErrorCode;
export type HostingResult<T> = ({ ok: true } & T) | { ok: false; code: HostingErrorCode; message: string };

/** What a member is shown. Never includes payment or server references. */
export type SectorView = {
  sectorId: string;
  state: SectorState;
  role: "host" | "member";
  options: HostedSectorOptions;
  members: number;
  humanPlaces: number;
  createdAt: number;
  openedAt?: number;
  endedAt?: number;
  /** Only for the host, only while payment is outstanding. */
  checkoutUrl?: string;
  /** True when creation has failed at least once since payment: "taking longer than expected". */
  delayed: boolean;
  /** Only while the sector is being split-funded. */
  funding?: FundingView;
};

/** `paymentRef` is the provider's reference for the payment, when the event carries one. */
export type PaymentEvent = { eventId: string; kind: "paid" | "expired" | "refunded" | "disputed"; sectorId: string; paymentRef?: string };
/** Everything the payment webhook can report: about a whole sector, or about one share of a split-funded one. */
export type HostingPaymentEvent = PaymentEvent | ContributionEvent;

export type HostingServiceDeps = {
  store: HostingStore;
  payment: PaymentProvider;
  signTicket: SectorTicketSigner;
  alert: HostingAlert;
  config: HostingConfig;
  now: () => number;
  /** Random, URL-safe, lowercase. Injected so tests are deterministic. */
  newId: (length: number) => string;
};

/** A sector people can still be invited to and join. */
const JOINABLE: readonly SectorState[] = ["awaiting_payment", "funding", "creating", "open"];

const fail = (code: HostingErrorCode, message: string): { ok: false; code: HostingErrorCode; message: string } => ({ ok: false, code, message });

export const createHostingService = (deps: HostingServiceDeps) => {
  const { store, config } = deps;
  const funding = createFundingService(deps);

  const view = (sector: SectorRecord, role: "host" | "member", accountUid: string): SectorView => {
    const fundingView = funding.view(sector, accountUid);
    return {
      sectorId: sector.sectorId,
      state: sector.state,
      role,
      options: sector.options,
      members: store.countMembers(sector.sectorId),
      humanPlaces: HOSTED_SECTOR_MAP_SIZES[sector.options.mapSize].humanPlaces,
      createdAt: sector.createdAt,
      ...(sector.openedAt !== undefined ? { openedAt: sector.openedAt } : {}),
      ...(sector.endedAt !== undefined ? { endedAt: sector.endedAt } : {}),
      ...(role === "host" && sector.state === "awaiting_payment" && sector.checkoutUrl ? { checkoutUrl: sector.checkoutUrl } : {}),
      delayed: sector.state === "creating" && sector.createAttempts > 0,
      ...(fundingView ? { funding: fundingView } : {})
    };
  };

  const hostedBy = (account: HostingAccount, sectorId: string): HostingResult<{ sector: SectorRecord }> => {
    const sector = store.getSector(sectorId);
    // The same answer for "no such sector" and "not yours", so ids cannot be probed.
    if (!sector || !store.getMember(sectorId, account.uid)) return fail("NOT_FOUND", "No such sector.");
    if (sector.hostUid !== account.uid) return fail("NOT_HOST", "Only the host can do this.");
    return { ok: true, sector };
  };

  const refundClosedOrder = async (sector: SectorRecord, event: PaymentEvent): Promise<void> => {
    const paymentRef = event.paymentRef ?? sector.paymentRef;
    try {
      if (!paymentRef) throw new Error("no payment reference to refund");
      await deps.payment.refund(paymentRef);
      deps.alert("payment_for_unknown_sector", { sectorId: sector.sectorId, kind: "paid_while_cancelled_refunded" });
    } catch (error) {
      // Thrown on, so the provider redelivers the event and the refund is tried again.
      deps.alert("payment_for_unknown_sector", { sectorId: sector.sectorId, kind: "paid_while_cancelled_refund_failed", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  return {
    /** `consent` is what the order form sent; nothing is sold without both boxes ticked. */
    async createOrder(account: HostingAccount, options: HostedSectorOptions, consent: unknown): Promise<HostingResult<{ sector: SectorView }>> {
      if (!config.salesEnabled) return fail("SALES_CLOSED", "Hosting is not on sale right now.");
      if (account.isGuest) return fail("ACCOUNT_REQUIRED", "Sign in with an account to host a sector.");
      if (!account.emailVerified) return fail("EMAIL_NOT_VERIFIED", "Verify your email address to host a sector.");
      const agreed = consentRecord(consent, deps.now());
      if (!agreed.ok) return fail(agreed.code, agreed.message);
      const existing = store.liveSectorForHost(account.uid);
      // A second press of Buy gets the same order and the same checkout back.
      if (existing?.state === "awaiting_payment" && existing.checkoutUrl) return { ok: true, sector: view(existing, "host", account.uid) };
      if (existing) return fail("ALREADY_HOSTING", "You already have a hosted sector running.");

      const now = deps.now();
      const sectorId = `s-${deps.newId(10)}`;
      store.insertSector({
        sectorId, hostUid: account.uid, options, state: "awaiting_payment",
        amountCents: HOSTED_SECTOR_PRICE_USD_CENTS, currency: "usd", createdAt: now, updatedAt: now, createAttempts: 0, consent: agreed.record
      });
      // The host is a member from the start, so the invite link can go out while they pay.
      store.addMember({ sectorId, accountUid: account.uid, role: "host", joinedAt: now });
      try {
        const checkout = await deps.payment.createCheckout({ sectorId, accountUid: account.uid, amountCents: HOSTED_SECTOR_PRICE_USD_CENTS, currency: "usd", options, createdAt: now });
        store.transitionSector(sectorId, ["awaiting_payment"], { paymentRef: checkout.paymentRef, checkoutUrl: checkout.checkoutUrl }, deps.now());
      } catch (error) {
        store.transitionSector(sectorId, ["awaiting_payment"], { state: "cancelled", lastError: error instanceof Error ? error.message : String(error) }, deps.now());
        return fail("PAYMENT_UNAVAILABLE", "Payment could not be started. Nothing was charged; please try again.");
      }
      const sector = store.getSector(sectorId);
      if (!sector) throw new Error(`sector ${sectorId} vanished after insert`);
      return { ok: true, sector: view(sector, "host", account.uid) };
    },

    /** Split funding: open a bar instead of paying in full (plan section 12). */
    openFundingBar(account: HostingAccount, options: HostedSectorOptions): HostingResult<{ sector: SectorView }> {
      const opened = funding.openFundingBar(account, options);
      return opened.ok ? { ok: true, sector: view(opened.sector, "host", account.uid) } : opened;
    },

    /** Split funding: pledge a share. Returns the checkout to complete it. */
    contribute: funding.contribute,

    /**
     * Applies a verified event from the payment provider. Safe to call any
     * number of times with the same event: every change is guarded by the
     * state it expects, and the event id is recorded after it is applied, so
     * a crash in between repeats the (harmless) change instead of losing it.
     */
    async handlePaymentEvent(event: HostingPaymentEvent): Promise<{ applied: boolean }> {
      const now = deps.now();
      // Providers deliver events more than once; a repeat changes nothing and alerts nobody.
      if (store.hasPaymentEvent(event.eventId)) return { applied: false };
      if ("contributionId" in event) {
        const result = await funding.handleContributionEvent(event);
        store.recordPaymentEvent(event.eventId, now);
        return result;
      }
      const sector = store.getSector(event.sectorId);
      if (!sector) {
        deps.alert("payment_for_unknown_sector", { sectorId: event.sectorId, kind: event.kind });
        store.recordPaymentEvent(event.eventId, now);
        return { applied: false };
      }
      let applied = false;
      if (event.kind === "paid") {
        applied = store.transitionSector(sector.sectorId, ["awaiting_payment"], { state: "creating", paidAt: now, createAttempts: 0 }, now);
        // Money arrived for an order we had already closed (its checkout was
        // still payable when we gave up on it): return it, and tell the owner.
        if (!applied && sector.state === "cancelled") await refundClosedOrder(sector, event);
      } else if (event.kind === "expired") {
        applied = store.transitionSector(sector.sectorId, ["awaiting_payment"], { state: "cancelled" }, now);
      } else if (event.kind === "refunded") {
        // The reconciler deletes the server of a refunded sector, if one exists.
        applied = store.transitionSector(sector.sectorId, ["awaiting_payment", "creating", "open", "ended"], { state: "refunded" }, now);
      } else {
        deps.alert("payment_dispute", { sectorId: sector.sectorId, state: sector.state });
      }
      store.recordPaymentEvent(event.eventId, now);
      return { applied };
    },

    listSectors(account: HostingAccount): SectorView[] {
      return store.listSectorsForAccount(account.uid).map((sector) => view(sector, sector.hostUid === account.uid ? "host" : "member", account.uid));
    },

    getSector(account: HostingAccount, sectorId: string): HostingResult<{ sector: SectorView }> {
      const sector = store.getSector(sectorId);
      const member = sector ? store.getMember(sectorId, account.uid) : undefined;
      if (!sector || !member) return fail("NOT_FOUND", "No such sector.");
      return { ok: true, sector: view(sector, member.role, account.uid) };
    },

    createInvite(account: HostingAccount, sectorId: string): HostingResult<{ invite: SectorInvite }> {
      const owned = hostedBy(account, sectorId);
      if (!owned.ok) return owned;
      if (!JOINABLE.includes(owned.sector.state)) return fail("SECTOR_CLOSED", "This sector is no longer open to new members.");
      const now = deps.now();
      if (store.countActiveInvites(sectorId, now) >= config.maxActiveInvitesPerSector) return fail("TOO_MANY_INVITES", "Revoke an invite link before making another.");
      const invite: SectorInvite = { code: deps.newId(20), sectorId, createdBy: account.uid, createdAt: now, expiresAt: now + config.inviteTtlMs };
      store.insertInvite(invite);
      return { ok: true, invite };
    },

    revokeInvite(account: HostingAccount, code: string): HostingResult<{ revoked: boolean }> {
      const invite = store.getInvite(code);
      if (!invite) return fail("NOT_FOUND", "No such invite.");
      const owned = hostedBy(account, invite.sectorId);
      if (!owned.ok) return owned;
      return { ok: true, revoked: store.revokeInvite(code, deps.now()) };
    },

    /** No awaits between the place count and the insert, so two accepts cannot both take the last place. */
    acceptInvite(account: HostingAccount, code: string): HostingResult<{ sector: SectorView }> {
      if (account.isGuest && !config.allowGuestMembers) return fail("ACCOUNT_REQUIRED", "Sign in with an account to join a hosted sector.");
      const now = deps.now();
      const invite = store.getInvite(code);
      if (!invite || invite.revokedAt !== undefined || invite.expiresAt <= now) return fail("INVITE_INVALID", "This invite link is no longer valid.");
      const sector = store.getSector(invite.sectorId);
      if (!sector || !JOINABLE.includes(sector.state)) return fail("SECTOR_CLOSED", "This sector is no longer open to new members.");
      if (!store.getMember(sector.sectorId, account.uid)) {
        if (store.countMembers(sector.sectorId) >= HOSTED_SECTOR_MAP_SIZES[sector.options.mapSize].humanPlaces) return fail("SECTOR_FULL", "This sector has no places left.");
        store.addMember({ sectorId: sector.sectorId, accountUid: account.uid, role: "member", joinedAt: now });
      }
      return { ok: true, sector: view(sector, sector.hostUid === account.uid ? "host" : "member", account.uid) };
    },

    /** The ticket and address a member's client needs to connect to the sector's own server. */
    async issueTicket(account: HostingAccount, sectorId: string): Promise<HostingResult<{ ticket: string; expiresAt: number; wsUrl: string }>> {
      const sector = store.getSector(sectorId);
      if (!sector || !store.getMember(sectorId, account.uid)) return fail("NOT_MEMBER", "You are not a member of this sector.");
      // An ended sector stays enterable while it is up, to look at the final map.
      if ((sector.state !== "open" && sector.state !== "ended") || !sector.hostname) return fail("SECTOR_NOT_READY", "This sector is not open.");
      const signed = await deps.signTicket({ sectorId, accountUid: account.uid });
      return { ok: true, ticket: signed.ticket, expiresAt: signed.expiresAt, wsUrl: `wss://${sector.hostname}/ws` };
    }
  };
};

export type HostingService = ReturnType<typeof createHostingService>;
