import { SHARD_MOBILIZE_SHARD_COST } from "@border-empires/shared";
import { pushFeed, type FeedMutableState } from "../client-alerts/client-alerts.js";
import { showShardDonationOverlay } from "../client-shard-collect/client-shard-collect.js";

// Shard Mobilization card for the manpower panel: donates one Shard to the
// Court for an Imperial delivery that refills manpower to the cap at once (SHARD_MOBILIZE; server rules in
// apps/simulation/src/shard-mobilize/). The result arrives through the
// ordinary PLAYER_UPDATE (manpower and Shard count); the one-off
// SHARD_MOBILIZED message only drives the delivery announcement. Rejections
// use the SHARD_MOBILIZE_INVALID code.

export type ShardMobilizeCardInput = {
  shards: number;
  manpower: number;
  manpowerCap: number;
  /** 0 or less means the Titanium Levy's regen freeze is active (see manpowerFullStatusText). */
  manpowerRegenPerMinute: number;
};

const blockedReason = (input: ShardMobilizeCardInput): string | undefined => {
  if (input.manpowerRegenPerMinute <= 0) return "Unavailable while your Titanium Levy freeze is active.";
  if (input.manpower >= input.manpowerCap) return "Manpower is already full.";
  if (input.shards < SHARD_MOBILIZE_SHARD_COST) return "You have no Shards. Collect one from a shard rain site on your land.";
  return undefined;
};

export const shardMobilizeCardHtml = (input: ShardMobilizeCardInput): string => {
  const reason = blockedReason(input);
  const missing = Math.max(0, Math.floor(input.manpowerCap - input.manpower));
  return `
    <section class="card manpower-detail-card shard-mobilize-card">
      <h4>Shard Mobilization</h4>
      <div class="economy-footnote">Donate ${SHARD_MOBILIZE_SHARD_COST} Shard to the Court and it ships an Imperial delivery of ready-made ancillaries, filling your manpower to the cap at once. You hold ${Math.floor(input.shards)}.</div>
      <button class="panel-btn" type="button" data-shard-mobilize${reason ? " disabled" : ""}>
        ${reason ? "Donate Shard" : `Donate Shard: +${missing} manpower`}
      </button>
      ${reason ? `<div class="economy-footnote">${reason}</div>` : ""}
    </section>
  `;
};

export const bindShardMobilizeButtons = (root: ParentNode, sendGameMessage: (payload: unknown, message?: string) => boolean): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-shard-mobilize]").forEach((button) => {
    button.onclick = () => {
      if (button.disabled) return;
      // Stay disabled until the next HUD render brings the new pool and Shard
      // count, so a double-click can't send a second donation.
      if (sendGameMessage({ type: "SHARD_MOBILIZE" }, "Finish sign-in before donating a Shard.")) button.disabled = true;
    };
  });
};

/** SHARD_MOBILIZED: the server accepted the donation; announce the Court's delivery in a card and the Activity Feed. */
export const applyShardMobilizedMessage = (state: FeedMutableState, msg: Record<string, unknown>): void => {
  const delivered = typeof msg.delivered === "number" ? Math.max(0, Math.floor(msg.delivered)) : 0;
  pushFeed(state, `The Court looks favourably on your donation. A delivery of ${delivered.toLocaleString()} ancillaries has arrived.`, "info", "success");
  showShardDonationOverlay(delivered);
};
