export interface AcquisitionParams {
  readonly source?: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly referrer?: string;
}

// Captures where a visitor came from: utm_* query params (for links we
// control, e.g. GAME_SHARE_URL) and the raw document.referrer (for organic
// search/backlinks, which never carry utm_* params). Never throws.
export const readAcquisitionParams = (): AcquisitionParams => {
  try {
    const params = new URLSearchParams(window.location.search);
    const acquisition: Record<string, string> = {};
    const source = params.get("utm_source");
    const medium = params.get("utm_medium");
    const campaign = params.get("utm_campaign");
    const referrer = document.referrer;
    if (source) acquisition.source = source;
    if (medium) acquisition.medium = medium;
    if (campaign) acquisition.campaign = campaign;
    if (referrer) acquisition.referrer = referrer;
    return acquisition;
  } catch {
    return {};
  }
};
