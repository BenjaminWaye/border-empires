// The season-end charge reward: when a Sector Contest is crowned and the
// reveal shows this House held charges, a full-screen moment opens over the
// season-end screen. The cards start sealed; Collect flips them one by one
// (rarest last) with a burst, a rising chime and a haptic tap, and each card's
// Domain score flies into the House's Domain total, which counts up. Shown once
// per crowned contest per browser.
//
// The Domain total comes from GET /hq/galaxy/me (`chargeDomain`), which every
// signed-in account has, with or without territory in space. The view-only
// Space View for players without a world is a follow-up: `openSpaceView` is
// the hook for its button.
import type { Auth } from "firebase/auth";
import type { ClientState } from "../client-state/client-state.js";
import type { HouseChargeRevealLoad } from "../client-house-charges/client-house-charge-reveal.js";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { chargeRewardHtml } from "./client-charge-reward-html.js";
import {
  type ChargeReward, chargeRewardFor, domainCountRange, isChargeRewardCollected, markChargeRewardCollected
} from "./client-charge-reward-model.js";
import {
  burstFrom, countUp, hapticTap, playCardChime, playTotalChime, prefersReducedMotion, unlockRewardAudio
} from "./client-charge-reward-fx.js";

export type ChargeRewardDeps = {
  state: Pick<ClientState, "me" | "seasonWinner" | "seasonEndDismissed"> & { houseChargeReveal?: HouseChargeRevealLoad | undefined };
  wsUrl?: string | undefined;
  firebaseAuth?: Pick<Auth, "currentUser"> | undefined;
  openSpaceView?: () => void;
};

const OVERLAY_ID = "charge-reward-overlay";
const DOMAIN_WAIT_MS = 2500;

/** The account's banked charge Domain score, or undefined when signed out, offline or not served. */
export const fetchChargeDomainTotal = async (wsUrl: string | undefined, auth: Pick<Auth, "currentUser"> | undefined): Promise<number | undefined> => {
  const user = auth?.currentUser;
  if (!wsUrl || !user) return undefined;
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/galaxy/me`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as { chargeDomain?: unknown } | undefined;
    return typeof body?.chargeDomain === "number" && Number.isFinite(body.chargeDomain) ? body.chargeDomain : undefined;
  } catch {
    return undefined;
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
const within = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([promise, sleep(ms).then(() => undefined)]);

/** The season whose reward is open (or was opened) in this page, so a rerender never opens it twice. */
let openedSeasonId: string | undefined;

/** The reward this House should be offered now, if any. */
export const pendingChargeReward = (state: ChargeRewardDeps["state"]): ChargeReward | undefined => {
  if (!state.seasonWinner || state.seasonEndDismissed) return undefined;
  const view = state.houseChargeReveal?.view;
  if (!view || typeof view !== "object") return undefined;
  const reward = chargeRewardFor(view, state.me || undefined);
  if (!reward || reward.seasonId === openedSeasonId || isChargeRewardCollected(reward.seasonId)) return undefined;
  return reward;
};

/** Called on every HUD render with the season-end screen; opens the reward once its reveal has loaded. */
export const renderChargeReward = (deps: ChargeRewardDeps): void => {
  const reward = pendingChargeReward(deps.state);
  if (!reward) return;
  openedSeasonId = reward.seasonId;
  openChargeReward(reward, deps);
};

export const openChargeReward = (reward: ChargeReward, deps: Pick<ChargeRewardDeps, "wsUrl" | "firebaseAuth" | "openSpaceView">): HTMLElement => {
  document.getElementById(OVERLAY_ID)?.remove();
  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.className = "cr-overlay is-sealed";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "cr-title");
  root.innerHTML = chargeRewardHtml(reward);
  document.body.appendChild(root);

  const domainTotal = fetchChargeDomainTotal(deps.wsUrl, deps.firebaseAuth);
  const $ = <T extends HTMLElement>(selector: string): T => root.querySelector(selector) as T;
  const valueEl = $<HTMLElement>("[data-cr-domain]");
  const collect = $<HTMLButtonElement>("[data-cr-collect]");
  const skip = $<HTMLButtonElement>("[data-cr-skip]");
  const done = $<HTMLButtonElement>("[data-cr-done]");
  let skipped = false;
  let range = { from: 0, to: reward.gained };
  void within(domainTotal, DOMAIN_WAIT_MS).then((total) => {
    range = domainCountRange(total, reward.gained);
    if (root.classList.contains("is-sealed")) valueEl.textContent = range.from.toLocaleString();
  });

  const finish = (): void => {
    root.classList.remove("is-sealed", "is-revealing");
    root.classList.add("is-done");
    root.querySelectorAll(".cr-slot").forEach((slot) => slot.classList.add("is-revealed"));
    valueEl.textContent = range.to.toLocaleString();
    $<HTMLElement>("[data-cr-gain]").hidden = false;
    $<HTMLElement>("[data-cr-note]").hidden = false;
    skip.hidden = true;
    done.hidden = false;
    const space = root.querySelector<HTMLButtonElement>("[data-cr-space]");
    if (space) space.hidden = false;
    done.focus();
  };

  const reveal = async (): Promise<void> => {
    unlockRewardAudio();
    root.classList.replace("is-sealed", "is-revealing");
    collect.hidden = true;
    skip.hidden = false;
    range = domainCountRange(await within(domainTotal, DOMAIN_WAIT_MS), reward.gained);
    // Skip may land while the total loads; finish() has already shown the final number.
    if (skipped) return;
    valueEl.textContent = range.from.toLocaleString();
    const quick = prefersReducedMotion();
    let running = range.from;
    for (const [index, entry] of reward.cards.entries()) {
      if (skipped) return;
      await sleep(quick ? 80 : index === 0 ? 350 : 750);
      if (skipped) return;
      const slot = root.querySelector<HTMLElement>(`[data-cr-slot="${index}"]`);
      slot?.classList.add("is-revealed");
      if (slot) burstFrom(slot, entry.card.rarity);
      playCardChime(index, entry.card.rarity);
      hapticTap(entry.card.rarity === "MYTHIC" ? [30, 40, 60] : entry.card.rarity === "RARE" ? [25, 30, 25] : 25);
      await sleep(quick ? 0 : 420);
      const next = running + entry.domain;
      await countUp(valueEl, running, next, quick ? 0 : 520, () => skipped);
      running = next;
    }
    if (skipped) return;
    await sleep(quick ? 0 : 300);
    root.classList.add("is-landed");
    playTotalChime();
    hapticTap([40, 60, 80]);
    finish();
  };

  collect.onclick = () => void reveal();
  skip.onclick = () => {
    skipped = true;
    finish();
  };
  done.onclick = () => {
    markChargeRewardCollected(reward.seasonId);
    root.classList.add("is-leaving");
    window.setTimeout(() => root.remove(), prefersReducedMotion() ? 0 : 260);
  };
  if (deps.openSpaceView) {
    const space = document.createElement("button");
    space.type = "button";
    space.className = "v2s-btn";
    space.dataset.crSpace = "";
    space.hidden = true;
    space.textContent = "View in Space";
    space.onclick = () => {
      done.click();
      deps.openSpaceView?.();
    };
    done.after(space);
  }
  collect.focus();
  return root;
};

/** Test hook: forget which season's reward this page already opened. */
export const resetChargeRewardForTests = (): void => {
  openedSeasonId = undefined;
  document.getElementById(OVERLAY_ID)?.remove();
};
