import type { Meta, StoryObj } from "@storybook/html-vite";
import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance } from "../../../../client/src/client-diplomacy-trade/client-diplomacy-trade.js";
const meta: Meta = { title:"UI/Diplomacy/Resource Supply", parameters:{layout:"fullscreen"}, render:()=>{
  closeDiplomacyTradeScreen();
  const host=document.createElement("div");
  host.style.cssText="min-height:100vh;background:#100d09;color:#f2e8d3;padding:24px;box-sizing:border-box";
  const output=document.createElement("pre"); output.style.whiteSpace="pre-wrap";
  const button=document.createElement("button"); button.textContent="Open resource negotiation";
  const show=()=>{
    openDiplomacyTradeScreen({targetName:"House Veyr",targetPlayerId:"veyr",kind:"trade",durationHours:12,
      terms:{give:{gold:0,shard:0,resources:{NEURAL_RESIN:1}},ask:{gold:2,shard:0}}}, {
      ownHoldings:()=>({gold:42,shard:2,resources:{FOOD:4,TITANIUM:2,NEURAL_RESIN:2,CONDUCTIVE_MINERALS:1,LUXURY_BIOTA:1}}),
      activeSupply:()=>({ownId:"self",agreements:[{id:"existing",proposerId:"self",targetId:"veyr",proposerGives:{LUXURY_BIOTA:1},targetGives:{FOOD:2},startedAt:Date.now()-3_600_000,fulfilled:true}]}),
      send:(payload)=>{output.textContent=JSON.stringify(payload,null,2);return true;}
    });
    receiveDiplomacyStance({found:true,targetPlayerName:"House Veyr",targetPlayerId:"veyr",ai:false});
  };
  button.onclick=show;host.append(button,output);queueMicrotask(show);return host;
}};
export default meta;
export const SupplyNegotiation: StoryObj = {};
