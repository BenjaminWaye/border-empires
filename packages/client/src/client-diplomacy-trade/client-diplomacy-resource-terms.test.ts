import { applyResourceTradeMessage } from "./client-player-resource-state.js";
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance, diplomacyTradeDepsFor, TRADE_HOLDINGS_CHECK_MS } from "./client-diplomacy-trade.js";
import { createInitialResourceTradeState, applyResourceTradeState } from "./client-resource-trade-state.js";
import { ClientMessageSchema } from "@border-empires/shared";
const empty={gold:0,shard:0};
afterEach(()=>{closeDiplomacyTradeScreen();vi.useRealTimers();});
describe("resource supply negotiation",()=>{
  it("sends the exact resource quantities and term from the actual diplomacy controls",()=>{
    const send=vi.fn((_payload: unknown, _message: string)=>true);
    openDiplomacyTradeScreen({targetName:"Milo",targetPlayerId:"other",kind:"trade",durationHours:12}, {
      send, ownHoldings:()=>({gold:50,shard:2,resources:{NEURAL_RESIN:2}})
    });
    receiveDiplomacyStance({found:true,targetPlayerName:"Milo",targetPlayerId:"other",ai:false});
    const overlay=document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
    expect(overlay.querySelector('[data-trade-kind="trade:0"]')?.getAttribute("aria-pressed")).toBe("true");
    const edit=(selector:string,value:string)=>{ const field=overlay.querySelector<HTMLInputElement|HTMLSelectElement>(selector)!; field.value=value; field.dispatchEvent(new Event("input")); };
    edit('[data-supply-give="NEURAL_RESIN"]',"2"); edit('[data-supply-ask="FOOD"]',"3");
    overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    const payload=send.mock.calls.at(-1)![0];
    expect(payload).toMatchObject({ type:"RESOURCE_TRADE_REQUEST",terms:{give:{...empty,resources:{NEURAL_RESIN:2}},ask:{...empty,resources:{FOOD:3}}} });
    expect(ClientMessageSchema.safeParse(payload).success).toBe(true);
  });
  it("prevents giving used slots and preserves resource terms when countering",()=>{
    const send=vi.fn((_payload: unknown, _message: string)=>true),terms={give:{...empty,resources:{PRECURSOR_SALVAGE:2}},ask:empty,supplyDurationHours:24 as const};
    openDiplomacyTradeScreen({targetName:"Milo",kind:"alliance",durationHours:12,terms}, {send,ownHoldings:()=>({...empty,resources:{PRECURSOR_SALVAGE:1}})});
    expect(document.querySelector<HTMLInputElement>('[data-supply-give="PRECURSOR_SALVAGE"]')?.value).toBe("2");
    expect(document.querySelector(".diplomacy-resource-terms table")?.parentElement?.textContent).toContain("Until either House cancels");
    expect(document.querySelector<HTMLButtonElement>('[data-trade-send]')?.disabled).toBe(true);
    expect(document.querySelector('[data-trade-verdict]')?.textContent).toContain("1 spare Precursor salvage");
  });
  it("keeps an older server's unsupported supply controls disabled",()=>{
    openDiplomacyTradeScreen({targetName:"Milo",kind:"truce",durationHours:12},diplomacyTradeDepsFor({gold:5,strategicResources:{}},()=>true));
    expect(document.querySelector('[data-supply-give]')).toBeNull();
    const state=createInitialResourceTradeState();
    applyResourceTradeState(state,{resourceTradeHoldings:{NEURAL_RESIN:1}});
    expect(state.resourceTradeHoldings).toEqual({NEURAL_RESIN:1});
    applyResourceTradeState(state,{resourceTradeHoldings:{NEURAL_RESIN:-2}});
    expect(state.resourceTradeHoldings).toBeUndefined();
  });
  it("refreshes delivery status while an open screen's Coin and spare inventory stay unchanged",()=>{
    vi.useFakeTimers({now:1});
    let fulfilled=true;
    openDiplomacyTradeScreen({targetName:"Milo",targetPlayerId:"other",kind:"truce",durationHours:12}, {
      send:()=>true,ownHoldings:()=>({...empty,resources:{}}),activeSupply:()=>({ownId:"self",agreements:[{
        id:"supply",proposerId:"self",targetId:"other",proposerGives:{FOOD:1},targetGives:{},startedAt:0,expiresAt:100000,fulfilled
      }]})
    });
    expect(document.querySelector('[data-resource-agreements]')?.textContent).toContain("Delivering");
    fulfilled=false;
    vi.advanceTimersByTime(TRADE_HOLDINGS_CHECK_MS);
    expect(document.querySelector('[data-resource-agreements]')?.textContent).toContain("Paused");
  });

  it("reviews an independent incoming offer and lets either participant end active supply",()=>{
    const send=vi.fn((_payload:unknown,_message:string)=>true),state=createInitialResourceTradeState();
    const active={id:"contract",proposerId:"other",targetId:"self",proposerGives:{FOOD:2},targetGives:{NEURAL_RESIN:1},startedAt:1,fulfilled:true};
    applyResourceTradeState(state,{resourceTradeHoldings:{NEURAL_RESIN:1},resourceTradeAgreements:[active]});
    applyResourceTradeMessage(state,{type:"RESOURCE_TRADE_UPDATE",offers:[{id:"offer",fromPlayerId:"other",toPlayerId:"self",fromPlayerName:"Milo",toPlayerName:"You",terms:{give:{...empty,resources:{FOOD:2}},ask:{...empty,resources:{NEURAL_RESIN:1}}},createdAt:1,expiresAt:Date.now()+3600000,status:"pending"}]});
    openDiplomacyTradeScreen({targetName:"Milo",targetPlayerId:"other",kind:"trade",durationHours:12},{
      send,ownHoldings:()=>({...empty,resources:state.resourceTradeHoldings}),activeSupply:()=>({ownId:"self",agreements:state.resourceTradeAgreements,offers:state.resourceTradeOffers})});
    document.querySelector<HTMLButtonElement>('[data-resource-offer-accept="offer"]')!.click();
    expect(send.mock.calls.at(-1)?.[0]).toEqual({type:"RESOURCE_TRADE_ACCEPT",offerId:"offer"});
    document.querySelector<HTMLButtonElement>('[data-resource-end="contract"]')!.click();
    expect(send.mock.calls.at(-1)?.[0]).toEqual({type:"RESOURCE_TRADE_END",agreementId:"contract"});
    applyResourceTradeState(state,{},true);
    expect(state.resourceTradeHoldings).toBeUndefined();
    expect(state.resourceTradeAgreements).toEqual([]);expect(state.resourceTradeOffers).toEqual([]);
  });

});
