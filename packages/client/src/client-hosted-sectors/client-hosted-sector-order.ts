// Buying a hosted sector: the form shown before payment and the checks on
// where the browser is sent to pay. The payment itself happens on the payment
// provider's page; this client never sees card details.
import {
  HOSTED_SECTOR_CONSENT_EARLY_START,
  HOSTED_SECTOR_CONSENT_TERMS,
  HOSTED_SECTOR_CONSENT_WORDING,
  HOSTED_SECTOR_MAP_SIZES,
  HOSTED_SECTOR_PRICE_FACTS,
  HOSTED_SECTOR_PRICE_USD_CENTS,
  HOSTED_SECTOR_TERMS_VERSION,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type HostedSectorConsent,
  type HostedSectorMapSize,
  type HostedSectorMapStyle
} from "@border-empires/shared";

/** Sent with an order or a share only when both boxes were ticked; the hosting service keeps it as proof. */
export const CHECKOUT_CONSENT: HostedSectorConsent = {
  termsVersion: HOSTED_SECTOR_TERMS_VERSION, wording: HOSTED_SECTOR_CONSENT_WORDING, acceptedTerms: true, requestedEarlyStart: true
};

const TERMS_LINK = `<a href="/purchase-terms.html" target="_blank" rel="noopener">Terms of Sale</a>`;

/**
 * The two separate statements, both unticked (docs/legal-drafts/README.md,
 * item 2). `scope` names the inputs, so one panel can hold several.
 */
export const consentBoxesHtml = (scope = ""): string => `
  <label class="hosted-sector-consent">
    <input type="checkbox" class="sp-check" name="consentTerms"${scope ? ` data-hosted-sector-consent-terms="${scope}"` : ""} />
    <span>${HOSTED_SECTOR_CONSENT_TERMS.replace("Terms of Sale", TERMS_LINK)}</span>
  </label>
  <label class="hosted-sector-consent">
    <input type="checkbox" class="sp-check" name="consentEarlyStart"${scope ? ` data-hosted-sector-consent-early-start="${scope}"` : ""} />
    <span>${HOSTED_SECTOR_CONSENT_EARLY_START}</span>
  </label>`;

/** Options sold today. Others are shown but cannot be chosen until they can be played. */
export const sellableMapStyles: readonly HostedSectorMapStyle[] = ["continents"];

/** A size is sold only if this build can draw it; see hostedSectorFitsThisBuild. */
export const mapSizeIsSellable = (size: HostedSectorMapSize): boolean =>
  HOSTED_SECTOR_MAP_SIZES[size].worldWidth === WORLD_WIDTH && HOSTED_SECTOR_MAP_SIZES[size].worldHeight === WORLD_HEIGHT;

export const hostedSectorPriceLabel = (): string => `USD ${(HOSTED_SECTOR_PRICE_USD_CENTS / 100).toFixed(HOSTED_SECTOR_PRICE_USD_CENTS % 100 === 0 ? 0 : 2)}`;

/**
 * The payment page's address comes from our hosting service, but it is where
 * the player is about to type card details, so it is checked before leaving.
 */
export const isAllowedCheckoutUrl = (checkoutUrl: string, pageIsLocal: boolean): boolean => {
  try {
    const url = new URL(checkoutUrl);
    if (pageIsLocal) return url.protocol === "https:" || url.protocol === "http:";
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
};

const option = (name: string, value: string, label: string, note: string, enabled: boolean, checked: boolean): string => `
  <label class="hosted-sector-option${enabled ? "" : " is-unavailable"}">
    <input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}${enabled ? "" : " disabled"} />
    <span><strong>${label}</strong><span class="hosted-sector-meta">${enabled ? note : `${note} Not available yet.`}</span></span>
  </label>`;

export const hostSectorFormHtml = (): string => {
  const sizes = Object.keys(HOSTED_SECTOR_MAP_SIZES) as HostedSectorMapSize[];
  const firstSize = sizes.find(mapSizeIsSellable);
  return `
    <form class="hosted-sector-form" data-hosted-sector-form>
      <p>Your own private Sector Contest, starting as soon as you have paid. Invite the players you want; AI Houses fill the other places. Buying it gives no advantage in play.</p>
      <fieldset>
        <legend>Map type</legend>
        ${option("mapStyle", "continents", "Continents", "Large landmasses with seas between them.", true, true)}
        ${option("mapStyle", "islands", "Islands", "Many small islands.", false, false)}
      </fieldset>
      <fieldset>
        <legend>Map size</legend>
        ${sizes.map((size) => {
          const spec = HOSTED_SECTOR_MAP_SIZES[size];
          return option("mapSize", size, size === "standard" ? "Standard" : "Small", `${spec.humanPlaces} human places and ${spec.aiHouses} AI Houses.`, mapSizeIsSellable(size), size === firstSize);
        }).join("")}
      </fieldset>
      <fieldset>
        <legend>How to pay</legend>
        ${option("payMode", "single", `I pay it all · ${hostedSectorPriceLabel()}`, "The sector starts as soon as you have paid.", true, true)}
        ${option("payMode", "split", "Split it with friends", "Open a funding bar and share the invite link. Each person chips in at least USD 5; cards are only held until the bar is full, then everyone is charged and the sector starts. If it is not full within 72 hours, nobody pays.", true, false)}
      </fieldset>
      <p class="hosted-sector-note">If you pay it all, tick both boxes. If you split it, everyone ticks them when they chip in.</p>
      ${consentBoxesHtml()}
      <p class="hosted-sector-note" data-hosted-sector-price-facts>Total ${hostedSectorPriceLabel()} if you pay it all. ${HOSTED_SECTOR_PRICE_FACTS}</p>
      <p class="hosted-sector-error" data-hosted-sector-form-error role="alert" hidden></p>
      <div class="hosted-sector-form-actions">
        <button type="button" class="panel-btn" data-hosted-sector-form-cancel>Back</button>
        <button type="submit" class="panel-btn"${firstSize ? "" : " disabled"}>Continue</button>
      </div>
      <p class="hosted-sector-note">The price includes any tax. You pay on a secure page run by Stripe.</p>
    </form>`;
};

/**
 * Reads the form. Undefined when a choice is missing, or when paying it all
 * with either consent box unticked. Opening a funding bar buys nothing: each
 * share asks for both consents when it is paid.
 */
export const readHostSectorForm = (form: HTMLFormElement): { mapStyle: HostedSectorMapStyle; mapSize: HostedSectorMapSize; split: boolean } | undefined => {
  const data = new FormData(form);
  const mapStyle = data.get("mapStyle");
  const mapSize = data.get("mapSize");
  const split = data.get("payMode") === "split";
  if (!split && (data.get("consentTerms") === null || data.get("consentEarlyStart") === null)) return undefined;
  if (typeof mapStyle !== "string" || !(sellableMapStyles as readonly string[]).includes(mapStyle)) return undefined;
  if ((mapSize !== "standard" && mapSize !== "small") || !mapSizeIsSellable(mapSize)) return undefined;
  return { mapStyle: mapStyle as HostedSectorMapStyle, mapSize, split };
};
