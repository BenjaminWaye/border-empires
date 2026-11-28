// Everything the hosting service does without a player asking: checking on
// unpaid orders, creating servers, retrying, refunding, and tearing down.
//
// One pass looks at every sector that is not in a resting state and performs
// its next step. Each step is safe to repeat and is recorded in the database
// before the next one starts, so the service can be stopped at any moment
// (every production deploy restarts it) and simply carries on.
import type { HostingStore, SectorRecord } from "../hosting-store/hosting-store.js";
import type { HostingAlert, PaymentProvider, ServerProvider } from "../providers/providers.js";
import { createWithdrawalService } from "./hosting-withdrawal.js";
import { createFundingReconciler } from "./funding-reconciler.js";
import { creationRetryDelayMs, type HostingConfig } from "./hosting-config.js";
import { parseContestResults, type HostedResultsStore } from "../hosting-results/hosted-results.js";
import { IDLE_WARNING_LEAD_MS, IDLE_WARNING_MAX_WAIT_MS, type HostingMailer } from "../hosting-email/hosting-mailer.js";

export type HostingReconcilerDeps = {
  store: HostingStore;
  payment: PaymentProvider;
  servers: ServerProvider;
  alert: HostingAlert;
  config: HostingConfig;
  now: () => number;
  /** Called once when a sector opens (the "your sector is ready" email). Must not throw. */
  onSectorOpened?: (sector: SectorRecord) => void;
  /** Player emails (hosting-email): sent on every pass, and the warning before an idle sector closes. */
  mailer?: HostingMailer;
  /** Where a sector's results are saved before its server is deleted (plan step 8d). */
  results?: HostedResultsStore;
  /** After each pass: how many emails were sent and how many wait, or why the pass failed. For the log. */
  onEmailPass?: (result: { sent: number; pending: number; addresses: number } | { error: string }) => void;
};

/** How long a server is kept while its results cannot be read, before it is deleted without them. */
export const RESULTS_EXPORT_GRACE_MS = 3 * 24 * 60 * 60_000;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export const createHostingReconciler = (deps: HostingReconcilerDeps) => {
  const { store, config } = deps;
  const funding = createFundingReconciler(deps);
  const withdrawals = createWithdrawalService(deps);
  // The highest running-count mark already reported, so each is reported once per process.
  let reportedMark = 0;

  /** A webhook may have been missed: ask the provider about orders past their checkout expiry. */
  const checkUnpaid = async (sector: SectorRecord, now: number): Promise<void> => {
    if (now - sector.createdAt < config.checkoutExpiryMs) return;
    // No checkout was ever created (the service stopped mid-order): nothing can have been paid.
    const status = sector.paymentRef ? await deps.payment.getCheckoutStatus(sector.paymentRef) : "expired";
    if (status === "paid") store.transitionSector(sector.sectorId, ["awaiting_payment"], { state: "creating", paidAt: now, createAttempts: 0 }, now);
    else if (status === "expired") store.transitionSector(sector.sectorId, ["awaiting_payment"], { state: "cancelled" }, now);
  };

  const refund = async (sector: SectorRecord, now: number): Promise<void> => {
    try {
      // A split-funded sector has no single payment: every share is given back.
      if (sector.paymentRef) await deps.payment.refund(sector.paymentRef);
      else if (!(await funding.unwind(sector, now))) throw new Error("some shares could not be refunded yet");
      if (store.transitionSector(sector.sectorId, ["creating"], { state: "refunded" }, now)) {
        deps.alert("sector_refunded_automatically", { sectorId: sector.sectorId, attempts: sector.createAttempts });
      }
    } catch (error) {
      // Stays in "creating": the refund is retried on the next pass.
      store.transitionSector(sector.sectorId, ["creating"], { lastError: errorText(error), nextAttemptAt: now + creationRetryDelayMs(1) }, now);
      deps.alert("sector_refund_failed", { sectorId: sector.sectorId, error: errorText(error) });
    }
  };

  const create = async (sector: SectorRecord, now: number): Promise<void> => {
    if (sector.nextAttemptAt !== undefined && now < sector.nextAttemptAt) return;
    if (sector.paidAt !== undefined && now - sector.paidAt >= config.refundAfterMs) {
      await refund(sector, now);
      return;
    }
    try {
      let { serverRef, hostname } = sector;
      if (!serverRef || !hostname) {
        ({ serverRef, hostname } = await deps.servers.createServer({ sectorId: sector.sectorId, options: sector.options }));
        // Recorded before anything else, so a restart never requests a second server.
        if (!store.transitionSector(sector.sectorId, ["creating"], { serverRef, hostname }, now)) {
          // The order changed while the server was being made (a refund
          // arrived): nothing would ever look after this server, so remove it.
          await deps.servers.deleteServer(serverRef);
          return;
        }
      }
      // Not healthy yet is normal while the world is generated; look again next pass.
      if (!(await deps.servers.isHealthy(hostname))) {
        // ...but not for long. Counted as the first failure, so the owner hears now
        // and the player sees the delay, instead of both learning at the refund.
        if (sector.createAttempts === 0 && sector.paidAt !== undefined && now - sector.paidAt >= config.slowOpenAlertMs) {
          store.transitionSector(sector.sectorId, ["creating"], { createAttempts: 1, lastError: "server not healthy yet" }, now);
          deps.alert("sector_creation_failing", { sectorId: sector.sectorId, error: "server not healthy yet" });
        }
        return;
      }
      if (store.transitionSector(sector.sectorId, ["creating"], { state: "open", openedAt: now, lastError: null, nextAttemptAt: null }, now)) {
        const opened = store.getSector(sector.sectorId);
        if (opened) deps.onSectorOpened?.(opened);
      }
    } catch (error) {
      const attempts = sector.createAttempts + 1;
      store.transitionSector(sector.sectorId, ["creating"], { createAttempts: attempts, nextAttemptAt: now + creationRetryDelayMs(attempts), lastError: errorText(error) }, now);
      // The owner hears about the first failure, not the last (plan section 10).
      if (attempts === 1) deps.alert("sector_creation_failing", { sectorId: sector.sectorId, error: errorText(error) });
    }
  };

  /**
   * Saves the results of a sector that opened before its server goes, and
   * says whether the server may now be deleted. A crowned copy is final and
   * was usually saved at crowning; otherwise the summary is read now. A server
   * whose results cannot be read is kept, and the owner told when this starts
   * (plan section 10), for RESULTS_EXPORT_GRACE_MS; after that it is deleted
   * anyway and the owner told the results are lost, so a dead server is not
   * billed for ever.
   */
  const saveResults = async (sector: SectorRecord, now: number): Promise<boolean> => {
    const { results } = deps;
    if (!results || sector.openedAt === undefined || !sector.hostname || results.hasCrowned(sector.sectorId)) return true;
    try {
      const read = parseContestResults(await deps.servers.getContestSummary(sector.hostname));
      // An ended contest has a winner; a summary without one is not that contest's.
      if (sector.state === "ended" && !read.crowned) throw new Error("the summary of an ended contest names no winner");
      results.save(sector.sectorId, read, now);
      results.clearFailure(sector.sectorId);
      return true;
    } catch (error) {
      // An earlier reading (a closure whose delete failed) is better than none.
      if (results.has(sector.sectorId)) return true;
      const since = results.noteFailure(sector.sectorId, now);
      if (since === now) deps.alert("results_export_failed", { sectorId: sector.sectorId, state: sector.state, error: errorText(error) });
      if (now - since < RESULTS_EXPORT_GRACE_MS) return false;
      deps.alert("results_export_abandoned", { sectorId: sector.sectorId, state: sector.state, error: errorText(error) });
      results.clearFailure(sector.sectorId);
      return true;
    }
  };

  /** Deletes the server of a sector that no longer needs one, after saving its results. Without `then`, the row keeps its state. */
  const deleteServer = async (sector: SectorRecord, now: number, then?: { state: "deleted"; closedAt?: number }): Promise<boolean> => {
    if (sector.serverRef && !(await saveResults(sector, now))) return false;
    try {
      if (sector.serverRef) await deps.servers.deleteServer(sector.serverRef);
      return store.transitionSector(sector.sectorId, [sector.state], { ...then, serverRef: null, lastError: null }, now);
    } catch (error) {
      store.transitionSector(sector.sectorId, [sector.state], { lastError: errorText(error) }, now);
      deps.alert("sector_teardown_failed", { sectorId: sector.sectorId, error: errorText(error) });
      return false;
    }
  };

  /** At crowning, the summary is the final one: saved then, not at teardown days later. A failure is tried again at teardown. */
  const saveCrownedResults = async (sector: SectorRecord, now: number): Promise<void> => {
    if (!deps.results || !sector.hostname) return;
    try {
      const read = parseContestResults(await deps.servers.getContestSummary(sector.hostname));
      if (read.crowned) deps.results.save(sector.sectorId, read, now);
    } catch {
      // Teardown reads it again, and alerts if it still cannot.
    }
  };

  const watchOpenSector = async (sector: SectorRecord, now: number): Promise<void> => {
    if (!sector.hostname) return;
    let status: Awaited<ReturnType<ServerProvider["getContestStatus"]>>;
    try {
      status = await deps.servers.getContestStatus(sector.hostname);
    } catch (error) {
      // Told once per outage: lastError is cleared when the server answers again.
      if (sector.lastError === undefined) deps.alert("sector_unreachable", { sectorId: sector.sectorId, error: errorText(error) });
      store.transitionSector(sector.sectorId, ["open"], { lastError: errorText(error) }, now);
      return;
    }
    if (sector.lastError !== undefined) store.transitionSector(sector.sectorId, ["open"], { lastError: null }, now);
    if (status.ended) {
      if (store.transitionSector(sector.sectorId, ["open"], { state: "ended", endedAt: now }, now)) await saveCrownedResults(sector, now);
      return;
    }
    // There is no time limit on a contest. What stops a forgotten sector
    // costing money for ever is this: nobody has visited for idleCloseMs.
    // Counted from opening when no human has ever come. No look-around
    // period follows, since there is nobody to look.
    const lastVisit = Math.max(status.lastHumanVisitAt ?? 0, sector.openedAt ?? sector.createdAt);
    if (now - lastVisit < config.idleCloseMs - IDLE_WARNING_LEAD_MS) return;
    // Members are warned two days ahead (Terms of Sale section 5): the sector
    // closes no sooner than two days after the warning went out. While it
    // cannot go out (the email provider is down) the sector waits, up to
    // IDLE_WARNING_MAX_WAIT_MS; with nobody reachable it closes two days after
    // the warning was written. Either way the owner is told it closed unwarned.
    let unwarned = 0;
    if (deps.mailer) {
      const warning = deps.mailer.warnIdle(sector, lastVisit, Math.max(lastVisit + config.idleCloseMs, now + IDLE_WARNING_LEAD_MS), now);
      if (warning?.sentAt !== undefined) {
        if (now - warning.sentAt < IDLE_WARNING_LEAD_MS) return;
      } else if (warning) {
        const stillTrying = deps.mailer.canSend() && warning.pending > 0 && now - warning.writtenAt < IDLE_WARNING_MAX_WAIT_MS;
        if (stillTrying || now - warning.writtenAt < IDLE_WARNING_LEAD_MS) return;
        unwarned = 1;
      }
    }
    if (now - lastVisit < config.idleCloseMs) return;
    if (await deleteServer(sector, now, { state: "deleted", closedAt: now })) {
      deps.alert("sector_closed_idle", { sectorId: sector.sectorId, idleDays: Math.floor((now - lastVisit) / 86_400_000), unwarned });
    }
  };

  const reportRunningCount = (): void => {
    const running = store.countSectorsByState().open;
    const mark = [...config.runningCountAlertMarks].reverse().find((candidate) => running >= candidate) ?? 0;
    if (mark > reportedMark) deps.alert("sector_running_count", { running, mark });
    reportedMark = mark;
  };

  return {
    /** One pass. A failure on one sector never stops the others. */
    async runOnce(): Promise<void> {
      for (const sector of store.listSectorsInStates(["awaiting_payment", "funding", "creating", "open", "ended", "cancelled", "refunded"])) {
        const now = deps.now();
        try {
          if (sector.state === "awaiting_payment") await checkUnpaid(sector, now);
          else if (sector.state === "funding") await funding.step(sector, now);
          else if (sector.state === "creating") await create(sector, now);
          else if (sector.state === "open") await watchOpenSector(sector, now);
          else if (sector.state === "ended") {
            if (sector.endedAt !== undefined && now - sector.endedAt >= config.lookAroundMs) await deleteServer(sector, now, { state: "deleted" });
          } else if (sector.serverRef) await deleteServer(sector, now);
        } catch (error) {
          store.transitionSector(sector.sectorId, [sector.state], { lastError: errorText(error) }, now);
        }
      }
      // A withdrawal's refund the payment provider did not accept yet is sent again.
      try {
        await withdrawals.retryPendingRefunds();
      } catch {
        // Each failure is alerted where it happens; the next pass tries again.
      }
      if (deps.mailer) {
        try {
          deps.onEmailPass?.(await deps.mailer.runOnce());
        } catch (error) {
          // A failed send is recorded per email; this is anything else. The next pass tries again.
          deps.onEmailPass?.({ error: errorText(error) });
        }
      }
      reportRunningCount();
      store.prunePaymentEvents(deps.now() - config.paymentEventRetentionMs);
    }
  };
};

export type HostingReconciler = ReturnType<typeof createHostingReconciler>;
