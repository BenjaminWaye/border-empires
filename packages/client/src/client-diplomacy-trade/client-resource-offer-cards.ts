import { describeDiplomacyTermsForProposer, describeDiplomacyTermsForRecipient, type ResourceTradeOffer } from "@border-empires/shared";
const esc=(text:string)=>text.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]??char);
export function resourceOfferCardsHtml(rows:readonly ResourceTradeOffer[],ownId:string,otherId:string|undefined):string {
  const offers=rows.filter(row=>row.fromPlayerId===otherId||row.toPlayerId===otherId);
  if(!offers.length)return "";
  return `<h3>Resource trade offers</h3>${offers.map(row=>{
    const incoming=row.toPlayerId===ownId;
    const terms=incoming?describeDiplomacyTermsForRecipient(row.terms,row.fromPlayerName):describeDiplomacyTermsForProposer(row.terms,row.toPlayerName);
    const button=(action:string,label:string)=>`<button type="button" class="resource-trade-action" data-resource-offer-${action}="${esc(row.id)}">${label}</button>`;
    return `<article class="diplomacy-resource-agreement"><strong>${incoming?"Offer received":"Offer sent"}${row.status==="settling"?" · settling payment":""}</strong><p>${esc(terms)}</p>${incoming||row.status==="settling"?button("accept",row.status==="settling"?"Finish trade":"Accept trade"):""}${row.status==="pending"?button("reject",incoming?"Decline":"Withdraw"):""}</article>`;
  }).join("")}`;
}
/** Overview cards use the same review action for both pending and active trades. */
export function resourceTradeOverviewHtml(rows:readonly ResourceTradeOffer[],ownId:string):string {
  return rows.map(row=>{
    const incoming=row.toPlayerId===ownId,id=incoming?row.fromPlayerId:row.toPlayerId,name=incoming?row.fromPlayerName:row.toPlayerName;
    return `<article class="card alliance-reference-card"><strong>${esc(name)}</strong><p>${incoming?"Resource offer received":"Resource offer sent"}${row.status==="settling"?" · payment settling":""}</p><button type="button" class="panel-btn propose-resource-trade" data-propose-player-id="${esc(id)}" data-propose-player-name="${esc(name)}">Review trade</button></article>`;
  }).join("");
}
export function resourceAgreementOverviewHtml(rows:readonly import("@border-empires/shared").ResourceSupplyAgreementStatus[],ownId:string,nameOf:(id:string)=>string|undefined):string {
  return rows.map(row=>{const id=row.proposerId===ownId?row.targetId:row.proposerId;return `<article class="card alliance-reference-card"><strong>${esc(nameOf(id)??id)}</strong><p>Resource supply · ${row.fulfilled?"Delivering":"Paused"} · until cancelled</p><button type="button" class="panel-btn propose-resource-trade" data-propose-player-id="${esc(id)}" data-propose-player-name="${esc(nameOf(id)??id)}">Review supply</button></article>`;}).join("");
}
