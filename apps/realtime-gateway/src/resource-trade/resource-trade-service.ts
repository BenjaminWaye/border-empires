import crypto from "node:crypto";
import { RESOURCE_TRADE_OFFER_TTL_MS, ResourceTradeOfferSchema, hasResourceSupplyOffer, evaluateResourceTradeOffer, supplyAgreementLimitMessage, supplyAgreementsFull,
  type ClientMessage, type DiplomacyGoods, type DiplomacyTerms, type ResourceTradeOffer } from "@border-empires/shared";
import type { WebSocket } from "ws";
import type { SocialState } from "../social-state/social-state-types.js";
import type { DiplomacySettlement } from "../diplomacy-settlement/diplomacy-settlement.js";
export interface ResourceTradeServiceDeps {
  social: Pick<SocialState,"resourceTradeOffers"|"resolvePlayerByName"|"resolvePlayerById"|"isTreatySupplySettling">;
  settlement: Pick<DiplomacySettlement,"settle"|"cancel">;
  now():number;
  isAutoRespondingAi(id:string):boolean;
  aiHoldings(id:string):Promise<DiplomacyGoods|undefined>;
  /** Active supply agreements this House is in, or undefined when unknown (the simulation still enforces the limit). */
  supplyAgreementCount?(id:string):Promise<number|undefined>;
  send(socket:WebSocket,payload:unknown):void;
  fanout(payloads:Map<string,unknown[]>):void;
  record(level:"info"|"warn"|"error",event:string,payload?:Record<string,unknown>):void;
}
export type ResourceTradeRequestResult={ok:true;offerId:string}|{ok:false;message:string};
export interface ResourceTradeService {
  handle(message:ClientMessage,actorId:string,socket:WebSocket,isGuest:boolean):Promise<boolean>;
  /** Same path as a player's RESOURCE_TRADE_REQUEST; used by AI-initiated trades too. */
  request(fromId:string,toId:string,terms:DiplomacyTerms,options?:{ttlMs?:number}):Promise<ResourceTradeRequestResult>;
  /** Pending (not settling) offers this House sent. */
  outgoingOfferCount(playerId:string):number;
  /** Withdraws pending offers between two Houses (either direction); settling payments finish. Returns how many. */
  withdrawOffersBetween(playerAId:string,playerBId:string):number;
}
/** Pending offers live durably in the social store. A stable simulation command
 * identity lets an uncertain payment be resumed after either process restarts. */
export function createResourceTradeService(ctx:ResourceTradeServiceDeps):ResourceTradeService {
  const store=ctx.social.resourceTradeOffers;
  const offersFor=(id:string)=>store.rows(ctx.now()).filter(row=>row.fromPlayerId===id||row.toPlayerId===id);
  const publish=(ids:readonly string[]):void=>{
    ctx.fanout(new Map(ids.map(id=>[id,[{type:"RESOURCE_TRADE_UPDATE",offers:offersFor(id)}]])));
    ctx.record("info","gateway_resource_trade_offers",{count:store.rows(ctx.now()).length});
  };
  /** Refuses a new offer when either House is at its supply agreement limit; `viewerId` reads "You". Accepts are
   * left to the simulation (which names the full House): a just-ended agreement may not be in a cached count yet. */
  const limitRefusal=async(viewerId:string,houses:readonly {id:string;name:string}[]):Promise<string|undefined>=>{
    for(const house of houses){
      let count:number|undefined;
      try{count=await ctx.supplyAgreementCount?.(house.id);}catch{count=undefined;}
      if(count!==undefined&&supplyAgreementsFull(count)){
        ctx.record("info","gateway_resource_trade_agreement_limit",{playerId:house.id,count});
        return supplyAgreementLimitMessage(house.id===viewerId?undefined:house.name);
      }
    }
    return undefined;
  };
  const accept=async(row:ResourceTradeOffer):Promise<string|undefined>=>{
    if(!store.settling(row.id))return "This resource offer is no longer available.";
    publish([row.fromPlayerId,row.toPlayerId]);
    const paid=await ctx.settlement.settle({proposerId:row.fromPlayerId,targetId:row.toPlayerId,terms:row.terms,
      commandId:`diplomacy-settle:resource-trade:${row.id}`,issuedAt:row.createdAt,refundIfLate:false});
    if(paid.ok||paid.rejected)store.remove(row.id);
    publish([row.fromPlayerId,row.toPlayerId]);
    // Only once the simulation has paid it: both sides' clients show "agreed" off this, never off the send.
    if(paid.ok)ctx.fanout(new Map([row.fromPlayerId,row.toPlayerId].map(id=>[id,[{type:"RESOURCE_TRADE_ACCEPTED",offerId:row.id,
      fromPlayerId:row.fromPlayerId,toPlayerId:row.toPlayerId,fromPlayerName:row.fromPlayerName,toPlayerName:row.toPlayerName}]])));
    return paid.ok?undefined:paid.message;
  };
  /** `replaces`: the pending offer `toId` made `fromId` that this one counters; swapped out in one step, and restored if the counter is refused. */
  const request=async(fromId:string,toId:string,terms:DiplomacyTerms,options:{ttlMs?:number;replaces?:string}={}):Promise<ResourceTradeRequestResult>=>{
    const from=ctx.social.resolvePlayerById(fromId),to=toId?ctx.social.resolvePlayerById(toId):undefined;
    if(!from||!to||from.id===to.id)return {ok:false,message:"Choose another House to trade with."};
    if(!hasResourceSupplyOffer(terms.give.resources)&&!hasResourceSupplyOffer(terms.ask.resources))return {ok:false,message:"Include at least one resource supply slot in the offer."};
    const now=ctx.now(),parsed=ResourceTradeOfferSchema.safeParse({id:crypto.randomUUID(),fromPlayerId:from.id,toPlayerId:to.id,
      fromPlayerName:from.name,toPlayerName:to.name,terms,createdAt:now,expiresAt:now+Math.min(options.ttlMs??RESOURCE_TRADE_OFFER_TTL_MS,RESOURCE_TRADE_OFFER_TTL_MS),status:"pending"});
    if(!parsed.success)return {ok:false,message:"Invalid resource trade terms."};
    const full=ctx.supplyAgreementCount?await limitRefusal(from.id,[from,to]):undefined;if(full)return {ok:false,message:full};
    const replaced=options.replaces===undefined?undefined:store.rows(ctx.now()).find(row=>
      row.id===options.replaces&&row.status==="pending"&&row.toPlayerId===from.id&&row.fromPlayerId===to.id);
    if(options.replaces!==undefined&&!replaced)return {ok:false,message:"The offer you countered is no longer available."};
    // Out before the counter goes in: the swap never needs a spare offer slot, and the two are never both live.
    if(replaced)store.remove(replaced.id);
    const restore=():void=>{if(replaced)store.insert(replaced);};
    if(!store.insert(parsed.data)){
      restore();
      ctx.record("warn","gateway_resource_trade_capacity",{count:store.rows(now).length});
      return {ok:false,message:"Too many resource offers are pending. Resolve an existing offer first."};
    }
    publish([from.id,to.id]);
    if(ctx.isAutoRespondingAi(to.id)){
      let holdings: DiplomacyGoods | undefined;
      try { holdings=await ctx.aiHoldings(to.id); } catch { ctx.record("warn","gateway_resource_trade_ai_unavailable",{playerId:to.id}); }
      // The sender can withdraw while the AI snapshot request is in flight.
      // A human takeover may also have accepted it; do not override that consent.
      const current=store.rows(ctx.now()).find(row=>row.id===parsed.data.id);
      if(!current||current.status!=="pending"||!ctx.isAutoRespondingAi(to.id))return {ok:true,offerId:parsed.data.id};
      if(!holdings||!evaluateResourceTradeOffer(current.terms,holdings).accepts){store.remove(parsed.data.id);restore();publish([from.id,to.id]);return {ok:false,message:`${to.name} declines these resource terms.`};}
      const failure=await accept(parsed.data);if(failure)return {ok:false,message:failure};
    }
    return {ok:true,offerId:parsed.data.id};
  };
  const outgoingOfferCount=(playerId:string):number=>store.rows(ctx.now()).filter(row=>row.fromPlayerId===playerId&&row.status==="pending").length;
  const withdrawOffersBetween=(a:string,b:string):number=>{
    const between=store.rows(ctx.now()).filter(row=>row.status==="pending"&&
      ((row.fromPlayerId===a&&row.toPlayerId===b)||(row.fromPlayerId===b&&row.toPlayerId===a)));
    for(const row of between)store.remove(row.id);
    if(between.length){publish([a,b]);ctx.record("info","gateway_resource_trade_offers_withdrawn_on_attack",{count:between.length});}
    return between.length;
  };
  return {request,outgoingOfferCount,withdrawOffersBetween,handle:async(message,actorId,socket,isGuest)=>{
    if(!message.type.startsWith("RESOURCE_TRADE_"))return false;
    const error=(text:string)=>ctx.send(socket,{type:"ERROR",code:"RESOURCE_TRADE_FAILED",message:text});
    if(message.type==="RESOURCE_TRADE_SYNC"){ctx.send(socket,{type:"RESOURCE_TRADE_UPDATE",offers:offersFor(actorId)});return true;}
    if(isGuest){error("Finish sign-in before trading resources.");return true;}
    if(message.type==="RESOURCE_TRADE_END"){
      const unfinished=store.rows(ctx.now()).find(row=>`diplomacy-settle:resource-trade:${row.id}`===message.agreementId&&row.status==="settling"&&[row.fromPlayerId,row.toPlayerId].includes(actorId));
      if(unfinished || ctx.social.isTreatySupplySettling(message.agreementId,actorId)){error("Finish the accepted trade's payment before ending its supply.");return true;}
      const result=await ctx.settlement.cancel(actorId,message.agreementId);if(!result.ok)error(result.message);return true;
    }
    if(message.type==="RESOURCE_TRADE_REQUEST"){
      const to=message.targetPlayerId?ctx.social.resolvePlayerById(message.targetPlayerId):ctx.social.resolvePlayerByName(message.targetPlayerName);
      const result=await request(actorId,to?.id??"",message.terms,message.countersOfferId===undefined?{}:{replaces:message.countersOfferId});
      if(!result.ok)error(result.message);
      return true;
    }
    if(message.type==="RESOURCE_TRADE_ACCEPT"||message.type==="RESOURCE_TRADE_REJECT"){
      const row=store.rows(ctx.now()).find(row=>row.id===message.offerId);
      if(!row||![row.fromPlayerId,row.toPlayerId].includes(actorId)){error("This resource offer is no longer available.");return true;}
      if(message.type==="RESOURCE_TRADE_REJECT"){
        if(row.status==="settling"){error("This offer is settling. Finish its payment before ending the agreement.");return true;}
        store.remove(row.id);publish([row.fromPlayerId,row.toPlayerId]);return true;
      }
      if(row.toPlayerId!==actorId&&row.status!=="settling"){error("Only the receiving House can accept this offer.");return true;}
      const failure=await accept(row);if(failure)error(failure);return true;
    }
    return true;
  }};
}
