import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESOURCE_NETWORKS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1792964349249, // Date.now() captured once.
  introducedIn: "2026.10.25.1",
  title: "Develop your land into an industrial heartland",
  why: "A resource-rich island should support a stronger campaign economy when you invest in it.",
  changes: [
    "New standard maps target 1,000 tiles each of neural resin, conductive minerals, catalysts, luxury biota and precursor salvage, grouped into deposits of 1–3 tiles in suitable biomes.",
    "Explore deposits and develop them with the matching industry. Implant Foundry unlocks alongside Ancillary Depot; Reclamation Works unlocks alongside Manufactory.",
    "Developed resin sites replenish supplied depots and conductive sites boost factory batches; towns still supply the bodies and depots determine storage.",
    "Catalysts and luxury exports back more Coin credit through Trade Nexuses; reclaimed machinery improves Manufactory-backed credit.",
    "Each supply slot supports one building: resin grants +12 Ancillaries per depot cycle, conductive minerals +6 per supplied factory, and credit resources +1.5 Coin/day. Extra buildings need additional supply slots.",
    "Conductive deposits expose branching metal seams in fractured rock; the Implant Foundry uses matching ore art in both map renderers.",
    "Deposits and extraction buildings have art in both the 2D and 3D maps. Decorative lone trees are removed; resin appears as distinct groves. Saved campaigns keep their existing deposits."
  ]
},
{
    createdAt: 1793079818176,
    introducedIn: "2026.10.26.1",
    title: "Negotiate resource supply",
    why: "Spare resource output can support another House's industry and become part of a diplomatic bargain.",
    changes: ["Make independent resource trade offers or include any of the nine supply resources alongside a treaty, Coin and Shards.", "Supply continues until either House ends the agreement. The diplomacy screen shows spare slots, offers and active deliveries; shortages pause both deliveries."]
  },
  {
    createdAt: 1793079818177,
    introducedIn: "2026.10.26.1",
    title: "More varied frontier deposits",
    why: "Repeated resource silhouettes made neighbouring deposits look identical.",
    changes: ["Each of the five frontier resources has three distinct deposit layouts, including alternate groves, ore formations, biota stands and salvage wrecks.", "A tile keeps the same variant in both the 3D map and 2D fallback; resource yields stay the same.", "Reclamation Works now show an overhead salvage crane, a dismantling cradle, a sorting conveyor and a recovery workshop."]
  },
  {
    createdAt: 1793084243762,
    introducedIn: "2026.10.26.1",
    title: "Clear resource descriptions and reliable supply agreements",
    why: "Deposits need clear activation requirements, and supply changes must remain consistent through diplomacy and hostile abilities.",
    changes: ["Every resource tile explains its purpose and renewable supply; frontier deposits explain their required industry and potential benefit.", "Supply agreements can be ended repeatedly and after reconnecting. Withdrawing an offer prevents a delayed AI response from accepting it.", "Siphon transfers working frontier-site supply without duplicating it; source changes pause or restore dependent trade deliveries."]
  },
  {
    createdAt: 1793123719143,
    introducedIn: "2026.10.27.1",
    title: "Compact resource panels",
    why: "Resource descriptions took too long to scan.",
    changes: ["One short sentence per resource, with bonuses and requirements in compact stat boxes."]
  },
  {
    createdAt: 1793134843253,
    introducedIn: "2026.10.27.2",
    title: "Reliable resource treaties",
    why: "Resource treaty payments must survive interrupted connections without being charged twice.",
    changes: ["Treaty resource payments resume safely after restart; industrial supply is visible in the desktop Economy panel. Trade imports and committed exports appear in both Economy layouts."]
  },
  {
    createdAt: 1793139521300,
    introducedIn: "2026.10.27.7",
    title: "Cheaper resource installations",
    why: "Developing a deposit should cost less than another Ancillary Factory.",
    changes: ["Resource installations cost about one third as much: Resin Extractor 40, Implant Foundry 50, Catalyst Refinery 50, Cultivation Estate 33 and Reclamation Works 60 Ancillaries."]
  },
  {
    createdAt: 1793139916650,
    introducedIn: "2026.10.27.7",
    title: "Implant Foundries support two factories",
    why: "Conductive supply should match resin output when split across two factory lines.",
    changes: ["One Implant Foundry provides two conductive slots: +6 Ancillaries per batch at each of two factories, +12 total. A single factory uses one slot; the spare slot can support another factory or be traded."]
  },
  {
    createdAt: 1793140658582,
    introducedIn: "2026.10.27.7",
    title: "Neural resin replenishes Ancillary Depots",
    why: "Depots should benefit from the resource that keeps their reserves ready.",
    changes: ["Each resin slot supplies one Ancillary Depot with +12 Ancillaries per four-hour cycle; factories use conductive supply instead."]
  },
  {
    createdAt: 1793218474689, // Date.now() captured once.
    introducedIn: "2026.10.28.1",
    title: "Readable frontier resources and open town support rings",
    why: "New deposits were missing map icons and could occupy useful town support tiles.",
    changes: ["Frontier resource panels show development bonuses and required installations, with distinct icons on both map renderers.", "New maps place frontier deposits outside towns' eight support tiles and keep catalysts off coastal sand. Existing campaigns keep their geography."]
  },
  {
    createdAt: 1793220040377, // Date.now() captured once.
    introducedIn: "2026.10.28.1",
    title: "Follow resource requirements to their unlocking research",
    why: "A technology name alone did not explain or open the resource's unlock.",
    changes: ["Select a resource’s required installation to open its details, then follow Unlocked by to select its technology in the Manifest tree.", "This navigation works in the redesigned desktop HUD and the classic and mobile layouts."]
  },
  {
    createdAt: 1793220634429, // Date.now() captured once.
    introducedIn: "2026.10.28.1",
    title: "Resource bonuses require development",
    why: "The resource card made a potential industry bonus look like immediate income from claiming land.",
    changes: ["Frontier deposit bonuses say After development and connect the bonus to a building without that resource’s supply. Required installation names open their building details. Claiming a deposit alone gives no industry bonus."]
  },
  {
    createdAt: 1793222577436, // Date.now() captured once.
    introducedIn: "2026.10.28.1",
    title: "Structure details link to their unlocking research",
    why: "Building details did not say which technology unlocked construction.",
    changes: ["Structure popups show Unlocked by with technology links to the selected Manifest. Resource cards link to their required installation; its popup links to unlocking research, without repeating a separate research box on the deposit. This works in both HUDs and mobile."]
  }

];
