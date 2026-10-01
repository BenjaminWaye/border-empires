// Mirrors SectorCampaign from the gateway's galaxy-sector-numbering.ts --
// the client has no direct dependency on apps/realtime-gateway, so this is
// a local copy of the wire shape, same as GalaxyViewPlanet/Outpost/Stipend
// mirror their gateway counterparts elsewhere in this file's siblings.
export type SectorCampaign = { kind: "FRONTIER" } | { kind: "CONTESTATION"; ordinal: number };

export const sectorNumberLabel = (sectorNumber: number): string => `Sector ${String(sectorNumber).padStart(3, "0")}`;

// 1st, 2nd, 3rd, 4th...11th, 12th, 13th, 21st -- the 11-13 teens exception
// to the usual 1/2/3-suffix rule.
const ordinalSuffix = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

// "Frontier Expansion of Sector 001" for the season that first claimed a
// territory, "1st/2nd/... Contestation of Sector 001" for each later
// Defense Campaign fought over it.
export const campaignLabel = (sectorNumber: number, campaign: SectorCampaign): string =>
  campaign.kind === "FRONTIER"
    ? `Frontier Expansion of ${sectorNumberLabel(sectorNumber)}`
    : `${ordinalSuffix(campaign.ordinal)} Contestation of ${sectorNumberLabel(sectorNumber)}`;
