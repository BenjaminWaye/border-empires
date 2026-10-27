import crypto from "node:crypto";
import { RESOURCE_TRADE_OFFER_TTL_MS, ResourceTradeOfferSchema, hasResourceSupplyOffer, evaluateResourceTradeOffer,
  type ClientMessage, type DiplomacyGoods, type ResourceTradeOffer } from "@border-empires/shared";
import type { WebSocket } from "ws";
import type { SocialState } from "../social-state/social-state-types.js";
import type { DiplomacySettlement } from "../diplomacy-settlement/diplomacy-settlement.js";
export interface ResourceTradeServiceDeps {
  social: Pick<SocialState,"resourceTradeOffers"|"resolvePlayerByName"|"resolvePlayerById">;
  settlement: Pick<DiplomacySettlement,"settle"|"cancel">;
  now():number;
  isAutoRespondingAi(id:string):boolean;
  aiHoldings(id:string):Promise<DiplomacyGoods|undefined>;
  send(socket:WebSocket,payload:unknown):void;
  fanout(payloads:Map<string,unknown[]>):void;
  record(level:"info"|"warn"|"error",event:string,payload?:Record<string,unknown>):void;
}
export interface ResourceTradeService { handle(message:ClientMessage,actorId:string,socket:WebSocket,isGuest:boolean):Promise<boolean> }
/** Pending offers live durably in the social store. A stable simulation command
 * identity lets an uncertain payment be resumed after either process restarts. */
export function createResourceTradeService(ctx:ResourceTradeServiceDeps):ResourceTradeService {
  const store=ctx.social.resourceTradeOffers;
  const offersFor=(id:string)=>store.rows(ctx.now()).filter(row=>row.fromPlayerId===id||row.toPlayerId===id);
  const publish=(ids:readonly string[]):void=>{
    ctx.fanout(new Map(ids.map(id=>[id,[{type:"RESOURCE_TRADE_UPDATE",offers:offersFor(id)}]])));
    ctx.record("info","gateway_resource_trade_offers",{count:store.rows(ctx.now()).length});
  };
  const accept=async(row:ResourceTradeOffer):Promise<string|undefined>=>{
    if(!store.settling(row.id))return "This resource offer is no longer available.";
    publish([row.fromPlayerId,row.toPlayerId]);
    const paid=await ctx.settlement.settle({proposerId:row.fromPlayerId,targetId:row.toPlayerId,terms:row.terms,
      commandId:`diplomacy-settle:resource-trade:${row.id}`,issuedAt:row.createdAt,refundIfLate:false});
    if(paid.ok||paid.rejected)store.remove(row.id);
    publish([row.fromPlayerId,row.toPlayerId]);
    return paid.ok?undefined:paid.message;
  };
  return {handle:async(message,actorId,socket,isGuest)=>{
    if(!message.type.startsWith("RESOURCE_TRADE_"))return false;
    const error=(text:string)=>ctx.send(socket,{type:"ERROR",code:"RESOURCE_TRADE_FAILED",message:text});
    if(message.type==="RESOURCE_TRADE_SYNC"){ctx.send(socket,{type:"RESOURCE_TRADE_UPDATE",offers:offersFor(actorId)});return true;}
    if(isGuest){error("Finish sign-in before trading resources.");return true;}
    if(message.type==="RESOURCE_TRADE_END"){
      const unfinished=store.rows(ctx.now()).find(row=>`diplomacy-settle:resource-trade:${row.id}`===message.agreementId&&row.status==="settling"&&[row.fromPlayerId,row.toPlayerId].includes(actorId));
      if(unfinished){error("Finish the accepted trade's payment before ending its supply.");return true;}
      const result=await ctx.settlement.cancel(actorId,message.agreementId);if(!result.ok)error(result.message);return true;
    }
    if(message.type==="RESOURCE_TRADE_REQUEST"){
      const from=ctx.social.resolvePlayerById(actorId),to=message.targetPlayerId?ctx.social.resolvePlayerById(message.targetPlayerId):ctx.social.resolvePlayerByName(message.targetPlayerName);
      if(!from||!to||from.id===to.id){error("Choose another House to trade with.");return true;}
      if(!hasResourceSupplyOffer(message.terms.give.resources)&&!hasResourceSupplyOffer(message.terms.ask.resources)){error("Include at least one resource supply slot in the offer.");return true;}
      const now=ctx.now(),parsed=ResourceTradeOfferSchema.safeParse({id:crypto.randomUUID(),fromPlayerId:from.id,toPlayerId:to.id,
        fromPlayerName:from.name,toPlayerName:to.name,terms:message.terms,createdAt:now,expiresAt:now+RESOURCE_TRADE_OFFER_TTL_MS,status:"pending"});
      if(!parsed.success){error("Invalid resource trade terms.");return true;}
      if(!store.insert(parsed.data)){ctx.record("warn","gateway_resource_trade_capacity",{count:store.rows(now).length});error("Too many resource offers are pending. Resolve an existing offer first.");return true;}
      publish([from.id,to.id]);
      if(ctx.isAutoRespondingAi(to.id)){
        let holdings: DiplomacyGoods | undefined;
        try { holdings=await ctx.aiHoldings(to.id); } catch { ctx.record("warn","gateway_resource_trade_ai_unavailable",{playerId:to.id}); }
        // The sender can withdraw while the AI snapshot request is in flight.
        // A human takeover may also have accepted it; do not override that consent.
        const current=store.rows(ctx.now()).find(row=>row.id===parsed.data.id);
        if(!current||current.status!=="pending")return true;
        const terms=current.terms;
        if(!holdings||!evaluateResourceTradeOffer(terms,holdings).accepts){store.remove(parsed.data.id);publish([from.id,to.id]);error(`${to.name} declines these resource terms.`);}
        else{const failure=await accept(parsed.data);if(failure)error(failure);}
      }
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
