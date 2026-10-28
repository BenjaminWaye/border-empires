import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { RuntimeDiplomacySettlementContext } from "../runtime-diplomacy-settlement-command.js";
export function handleCancelResourceSupplyCommand(ctx:RuntimeDiplomacySettlementContext,command:CommandEnvelope):void {
  const reject=(message:string)=>ctx.emitEvent({eventType:"COMMAND_REJECTED",commandId:command.commandId,playerId:command.playerId,code:"RESOURCE_TRADE_CANCEL_FAILED",message});
  let agreementId:string|undefined;
  try{const payload=JSON.parse(command.payloadJson) as {agreementId?:unknown};if(typeof payload.agreementId==="string"&&payload.agreementId.length<=160)agreementId=payload.agreementId;}catch{ /* Refuse malformed input. */ }
  if(!agreementId||!ctx.players.has(command.playerId))return reject("Invalid resource agreement.");
  if(!ctx.resourceSupply?.cancel)return reject("Resource trading is unavailable in this world.");
  const result=ctx.resourceSupply.cancel(agreementId,command.playerId);
  if(!result.ok)return reject(result.message);
  ctx.emitEvent({eventType:"COMMAND_RESOLVED",commandId:command.commandId,playerId:command.playerId});
}
