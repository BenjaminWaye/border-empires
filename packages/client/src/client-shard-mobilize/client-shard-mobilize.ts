import { SHARD_MOBILIZE_SHARD_COST } from "@border-empires/shared";

// Imperial delivery card for the manpower panel: donates one Shard to the
// Court in return for a delivery of ancillaries that refills manpower to the
// cap at once (SHARD_MOBILIZE; server rules in apps/simulation/src/shard-mobilize/,
// fiction in docs/lore/galactic-lore.md §3). The result arrives through the
// ordinary PLAYER_UPDATE (manpower and Shard count), so there is no one-off
// result message to handle; rejections use the SHARD_MOBILIZE_INVALID code.

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
  return undefined;
};

// Hidden entirely without a Shard to donate; with one, the button is shown
// disabled (styled in client-shard-mobilize-style.css) while full or frozen.
export const shardMobilizeCardHtml = (input: ShardMobilizeCardInput): string => {
  if (input.shards < SHARD_MOBILIZE_SHARD_COST) return "";
  const reason = blockedReason(input);
  const missing = Math.max(0, Math.floor(input.manpowerCap - input.manpower));
  return `
    <section class="card manpower-detail-card shard-mobilize-card">
      <h4>Imperial delivery</h4>
      <div class="economy-footnote">Donate ${SHARD_MOBILIZE_SHARD_COST} Shard to the Court and it ships in ready-made ancillaries, refilling your manpower to the cap at once. You hold ${Math.floor(input.shards)}.</div>
      <button class="panel-btn" type="button" data-shard-mobilize${reason ? " disabled" : ""}>
        ${reason ? "Request delivery" : `Request delivery: +${missing} manpower`}
      </button>
      ${reason ? `<div class="economy-footnote">${reason}</div>` : ""}
    </section>
  `;
};

export const bindShardMobilizeButtons = (root: ParentNode, sendGameMessage: (payload: unknown, message?: string) => boolean): void => {
  root.querySelectorAll<HTMLButtonElement>("[data-shard-mobilize]").forEach((button) => {
    button.onclick = () => {
      if (button.disabled) return;
      sendGameMessage({ type: "SHARD_MOBILIZE" }, "Finish sign-in before requesting an Imperial delivery.");
    };
  });
};
