import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { ClientMessage } from "@border-empires/shared";
import { createSocialState } from "../social-state/social-state.js";
import type { DiplomacySettlementInput, DiplomacySettlementResult } from "../diplomacy-settlement/diplomacy-settlement.js";
import { createResourceTradeService, type ResourceTradeServiceDeps } from "./resource-trade-service.js";
const terms={give:{gold:0,shard:0,resources:{NEURAL_RESIN:1}},ask:{gold:2,shard:0}};
const request:ClientMessage={type:"RESOURCE_TRADE_REQUEST",targetPlayerName:"B",targetPlayerId:"b",terms};
function setup(ai=false){
  const social=createSocialState({now:()=>1,players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}]});
  const settle=vi.fn(async(_input:DiplomacySettlementInput):Promise<DiplomacySettlementResult>=>({ok:true}));
  const cancel=vi.fn(async(_actor:string,_id:string):Promise<DiplomacySettlementResult>=>({ok:true}));
  const send=vi.fn(),fanout=vi.fn(),socket={} as WebSocket;
  const deps:ResourceTradeServiceDeps={social,settlement:{settle,cancel},now:()=>1,isAutoRespondingAi:id=>ai&&id==="b",
    aiHoldings:async()=>({gold:10,shard:0,resources:{FOOD:2}}),send,fanout,record:()=>undefined};
  return{deps,social,settle,cancel,send,fanout,socket,service:createResourceTradeService(deps)};
}
describe("independent resource trades",()=>{
  it("requires the recipient's acceptance and pays without creating a treaty",async()=>{
    const f=setup();await f.service.handle(request,"a",f.socket,false);
    const offer=f.social.resourceTradeOffers.rows(1)[0]!;
    expect(f.settle).not.toHaveBeenCalled();
    await f.service.handle({type:"RESOURCE_TRADE_ACCEPT",offerId:offer.id},"c",f.socket,false);
    expect(f.settle).not.toHaveBeenCalled();
    await f.service.handle({type:"RESOURCE_TRADE_ACCEPT",offerId:offer.id},"b",f.socket,false);
    expect(f.settle).toHaveBeenCalledWith(expect.objectContaining({proposerId:"a",targetId:"b",terms,refundIfLate:false}));
    expect(f.social.snapshotForPlayer("a").allies).toEqual([]);
    expect(f.social.snapshotForPlayer("a").activeTruces).toEqual([]);
    expect(f.social.resourceTradeOffers.rows(1)).toEqual([]);
  });
  it("resumes an uncertain payment with the same command identity and timestamp after restart",async()=>{
    const f=setup();f.settle.mockResolvedValueOnce({ok:false,message:"Timeout",pending:true});
    await f.service.handle(request,"a",f.socket,false);const row=f.social.resourceTradeOffers.rows(1)[0]!;
    await f.service.handle({type:"RESOURCE_TRADE_ACCEPT",offerId:row.id},"b",f.socket,false);
    expect(f.social.resourceTradeOffers.rows(1)[0]?.status).toBe("settling");
    await f.service.handle({type:"RESOURCE_TRADE_REJECT",offerId:row.id},"a",f.socket,false);
    expect(f.social.resourceTradeOffers.rows(1)).toHaveLength(1);
    await f.service.handle({type:"RESOURCE_TRADE_END",agreementId:`diplomacy-settle:resource-trade:${row.id}`},"a",f.socket,false);
    expect(f.cancel).not.toHaveBeenCalled();
    await createResourceTradeService(f.deps).handle({type:"RESOURCE_TRADE_ACCEPT",offerId:row.id},"a",f.socket,false);
    expect(f.settle.mock.calls[0]![0]).toEqual(f.settle.mock.calls[1]![0]);
    expect(f.settle.mock.calls[0]![0].issuedAt).toBe(row.createdAt);
    expect(f.social.resourceTradeOffers.rows(1)).toEqual([]);
  });
  it("lets either party dismiss an unpaid offer and blocks guests from ending supply",async()=>{
    const f=setup();await f.service.handle(request,"a",f.socket,false);const row=f.social.resourceTradeOffers.rows(1)[0]!;
    await f.service.handle({type:"RESOURCE_TRADE_REJECT",offerId:row.id},"a",f.socket,false);
    expect(f.social.resourceTradeOffers.rows(1)).toEqual([]);
    await f.service.handle({type:"RESOURCE_TRADE_END",agreementId:"contract"},"a",f.socket,true);
    expect(f.cancel).not.toHaveBeenCalled();
    await f.service.handle({type:"RESOURCE_TRADE_END",agreementId:"contract"},"b",f.socket,false);
    expect(f.cancel).toHaveBeenCalledWith("b","contract");
  });
  it("uses the same fair-exchange valuation for automatic AI trade acceptance",async()=>{
    const f=setup(true);await f.service.handle(request,"a",f.socket,false);
    expect(f.settle).toHaveBeenCalledOnce();
    await f.service.handle({...request,terms:{give:{gold:0,shard:0},ask:{gold:0,shard:0,resources:{FOOD:1}}}},"a",f.socket,false);
    expect(f.settle).toHaveBeenCalledOnce();
    expect(f.social.resourceTradeOffers.rows(1)).toEqual([]);
  });
});
