import { TRADABLE_SUPPLY_RESOURCES, UPKEEP_TRADE_RESOURCES, supplyResourceLabel, type ResourceSupplyAgreementStatus, type SlotResource } from "@border-empires/shared";
import { resourceDeadlineHtml, resourceTradeServerNow } from "../client-diplomacy-trade/client-resource-deadline.js";
import type { EconomyPanelArgs } from "./client-economy-html.js";

export type EconomyCommitments = {
  rows: readonly ResourceSupplyAgreementStatus[];
  ownId: string | undefined;
  playerName: (id: string) => string | undefined;
};

const escape = (value: string): string => value.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export const economyCommitmentsHtml = (args: EconomyPanelArgs, now = resourceTradeServerNow()): string => {
  const commitments = args.commitments;
  const ownId = commitments?.ownId;
  if (!commitments || !ownId) return "";
  const live = commitments.rows.filter(deal => (deal.proposerId === ownId || deal.targetId === ownId) &&
    (deal.expiresAt === undefined || deal.expiresAt > now));
  const rows = live.flatMap(deal => {
    const proposer = deal.proposerId === ownId;
    const partnerId = proposer ? deal.targetId : deal.proposerId;
    const partner = escape(commitments.playerName(partnerId) ?? partnerId);
    const imports = proposer ? deal.targetGives : deal.proposerGives;
    const exports = proposer ? deal.proposerGives : deal.targetGives;
    const items = TRADABLE_SUPPLY_RESOURCES.flatMap(resource => {
      const received = imports[resource] ?? 0;
      const supplied = exports[resource] ?? 0;
      const label = supplyResourceLabel(resource);
      const upkeepResource = UPKEEP_TRADE_RESOURCES.find(key => key === resource);
      const unit = upkeepResource ? "slot" : "site";
      const quantity = (amount: number): string => `${amount} ${label} ${unit}${amount === 1 ? "" : "s"}`;
      const flows = [received && `+${quantity(received)}`, supplied && `−${quantity(supplied)}`].filter(Boolean);
      if (!flows.length) return [];
      const shortfall = deal.fulfilled && deal.expiresAt !== undefined && received > supplied && upkeepResource
        ? projectedShortfall(args.resourceSlots, upkeepResource, live, ownId, deal.expiresAt) : 0;
      return [`<li>${flows.join(" · ")}${shortfall ? ` <strong>${shortfall} slot${shortfall === 1 ? "" : "s"} short when this deal ends</strong>` : ""}</li>`];
    });
    const incomingCoin = proposer ? deal.targetCoinPerHour : deal.proposerCoinPerHour;
    const outgoingCoin = proposer ? deal.proposerCoinPerHour : deal.targetCoinPerHour;
    if (incomingCoin) items.push(`<li>Up to +${incomingCoin * 24} Coin/day</li>`);
    if (outgoingCoin) items.push(`<li>Up to −${outgoingCoin * 24} Coin/day</li>`);
    return [`<article class="v2e-row">
      <div><strong>${partner}</strong> · ${resourceDeadlineHtml(deal.expiresAt, now)}${deal.fulfilled ? "" : " · Paused"}</div>
      <ul>${items.join("")}</ul>
      ${deal.expiresAt === undefined ? "" : `<div>Ends ${new Date(deal.expiresAt).toLocaleString()}</div>`}
      <button type="button" class="panel-btn propose-resource-trade" data-propose-player-id="${escape(partnerId)}" data-propose-player-name="${partner}">Review trade</button>
    </article>`];
  });
  return rows.length ? `<section class="v2e" aria-label="Trade commitments"><h3>Trade commitments</h3>${rows.join("")}</section>` : "";
};

const projectedShortfall = (
  slots: EconomyPanelArgs["resourceSlots"],
  resource: SlotResource,
  deals: readonly ResourceSupplyAgreementStatus[],
  ownId: string,
  at: number
): number => {
  const lost = deals.reduce((sum, deal) => {
    if (!deal.fulfilled || deal.expiresAt === undefined || deal.expiresAt > at) return sum;
    const netToTarget = (deal.proposerGives[resource] ?? 0) - (deal.targetGives[resource] ?? 0);
    return sum + (deal.targetId === ownId ? netToTarget : -netToTarget);
  }, 0);
  return Math.max(0, slots.demand[resource] - slots.supply[resource] + lost);
};
