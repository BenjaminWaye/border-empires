import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as {DatabaseSync:typeof DatabaseSyncType};
import { describe, expect, it } from "vitest";
import type { ResourceTradeOffer } from "@border-empires/shared";
import { InMemoryResourceTradeOfferStore, SqliteResourceTradeOfferStore } from "./resource-trade-store.js";
const offer=(id="offer",from="a",to="b"):ResourceTradeOffer=>({id,fromPlayerId:from,toPlayerId:to,fromPlayerName:from,toPlayerName:to,
  terms:{give:{gold:0,shard:0,resources:{NEURAL_RESIN:1}},ask:{gold:2,shard:0}},createdAt:1,expiresAt:100,status:"pending"});
describe.each([false,true])("bounded resource trade offers (SQLite=%s)",sqlite=>{
  it("expires pending offers, preserves uncertain settlements and clears campaign state",()=>{
    const db=sqlite?new DatabaseSync(":memory:"):undefined;
    try{
      const store=db?new SqliteResourceTradeOfferStore(db):new InMemoryResourceTradeOfferStore();
      expect(store.insert(offer())).toBe(true);expect(store.insert(offer("other"))).toBe(true);
      store.settling("offer");
      const restored=db?new SqliteResourceTradeOfferStore(db):store;
      expect(restored.rows(101)).toEqual([{...offer(),status:"settling"}]);
      restored.clear();expect(restored.rows(101)).toEqual([]);
    }finally{db?.close();}
  });
  it("enforces both direct global and per-player bounds",()=>{
    const db=sqlite?new DatabaseSync(":memory:"):undefined;
    try{
      const store=db?new SqliteResourceTradeOfferStore(db):new InMemoryResourceTradeOfferStore();
      for(let i=0;i<16;i++)expect(store.insert(offer(String(i)))).toBe(true);
      expect(store.insert(offer("overflow"))).toBe(false);store.clear();
      for(let i=0;i<256;i++)expect(store.insert(offer(String(i),`from-${i}`,`to-${i}`))).toBe(true);
      expect(store.insert(offer("overflow","new-a","new-b"))).toBe(false);
    }finally{db?.close();}
  });
});
