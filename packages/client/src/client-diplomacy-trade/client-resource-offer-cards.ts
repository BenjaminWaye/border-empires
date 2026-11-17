import { resourceDeadlineHtml, resourceTradeServerNow } from "./client-resource-deadline.js";
import { supplyAgreementUsageHtml } from "./client-supply-agreement-limit.js";
import { describeDiplomacyTermsForProposer, describeDiplomacyTermsForRecipient, swapDiplomacyTerms, type DiplomacyTerms, type ResourceTradeOffer } from "@border-empires/shared";
const esc=(text:string)=>text.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]??char);
/** `acceptBlockedReason` disables a fresh Accept (say, you are at your supply agreement limit) and says why. */
export function resourceOfferCardsHtml(rows:readonly ResourceTradeOffer[],ownId:string,otherId:string|undefined,acceptBlockedReason?:string):string {
  const offers=rows.filter(row=>row.fromPlayerId===otherId||row.toPlayerId===otherId);
  if(!offers.length)return "";
  return `<h3>Resource trade offers</h3>${offers.map(row=>{
    const incoming=row.toPlayerId===ownId;
    const terms=incoming?describeDiplomacyTermsForRecipient(row.terms,row.fromPlayerName):describeDiplomacyTermsForProposer(row.terms,row.toPlayerName);
    const blocked=incoming&&row.status==="pending"?acceptBlockedReason:undefined;
    const button=(action:string,label:string,disabled=false)=>`<button type="button" class="resource-trade-action" data-resource-offer-${action}="${esc(row.id)}"${disabled?" disabled":""}>${label}</button>`;
    return `<article class="diplomacy-resource-agreement"><strong>${incoming?"Offer received":"Offer sent"}${row.status==="settling"?" · settling payment":""}</strong><p>${esc(terms)}</p>${blocked?`<p class="diplomacy-resource-limit" data-tone="bad">Can't accept: ${esc(blocked)}</p>`:""}${incoming||row.status==="settling"?button("accept",row.status==="settling"?"Finish trade":"Accept trade",Boolean(blocked)):""}${incoming&&row.status==="pending"?button("counter","Counter"):""}${row.status==="pending"?button("reject",incoming?"Decline":"Withdraw"):""}</article>`;
  }).join("")}`;
}
/** "Counter" on an incoming offer: its terms from the recipient's side, to edit and send back; undefined once it's gone. */
export function resourceCounterTerms(rows:readonly ResourceTradeOffer[],offerId:string,ownId:string):DiplomacyTerms|undefined {
  const row=rows.find(row=>row.id===offerId&&row.toPlayerId===ownId&&row.status==="pending");
  return row?swapDiplomacyTerms(row.terms):undefined;
}
/** Overview cards use the same review action for both pending and active trades. */
export function resourceTradeOverviewHtml(rows:readonly ResourceTradeOffer[],ownId:string):string {
  return rows.map(row=>{
    const incoming=row.toPlayerId===ownId,id=incoming?row.fromPlayerId:row.toPlayerId,name=incoming?row.fromPlayerName:row.toPlayerName;
    return `<article class="card alliance-reference-card"><strong>${esc(name)}</strong><p>${incoming?"Resource offer received":"Resource offer sent"}${row.status==="settling"?" · payment settling":""}</p><button type="button" class="panel-btn propose-resource-trade" data-propose-player-id="${esc(id)}" data-propose-player-name="${esc(name)}">Review trade</button></article>`;
  }).join("");
}
export function resourceAgreementOverviewHtml(rows:readonly import("@border-empires/shared").ResourceSupplyAgreementStatus[],ownId:string,nameOf:(id:string)=>string|undefined):string {
  const now = resourceTradeServerNow();
  const active = rows.filter(row => row.expiresAt === undefined || row.expiresAt > now);
  return (active.length ? supplyAgreementUsageHtml(active.length) : "") + active.map(row=>{const id=row.proposerId===ownId?row.targetId:row.proposerId;return `<article class="card alliance-reference-card"><strong>${esc(nameOf(id)??id)}</strong><p>Resource supply · ${row.fulfilled?"Delivering":"Paused"} · ${resourceDeadlineHtml(row.expiresAt, now)}</p><button type="button" class="panel-btn propose-resource-trade" data-propose-player-id="${esc(id)}" data-propose-player-name="${esc(nameOf(id)??id)}">Review supply</button></article>`;}).join("");
}
