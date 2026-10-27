import type { DatabaseSync } from "node:sqlite";
import { MAX_PENDING_RESOURCE_TRADE_OFFERS as LIMIT, MAX_PENDING_RESOURCE_TRADE_OFFERS_PER_PLAYER as PLAYER_LIMIT,
  ResourceTradeOfferSchema, type ResourceTradeOffer } from "@border-empires/shared";
export interface ResourceTradeOfferStore {
  rows(now: number): readonly ResourceTradeOffer[];
  insert(row: ResourceTradeOffer): boolean;
  settling(id: string): boolean;
  remove(id: string): void;
  clear(): void;
}
const clone=(row:ResourceTradeOffer):ResourceTradeOffer=>ResourceTradeOfferSchema.parse(row);
function hasRoom(rows:readonly ResourceTradeOffer[],row:ResourceTradeOffer):boolean {
  return rows.length<LIMIT && [row.fromPlayerId,row.toPlayerId].every(id=>rows.filter(entry=>entry.fromPlayerId===id||entry.toPlayerId===id).length<PLAYER_LIMIT);
}
/** Every active map is capped directly; offers expire, unresolved payments remain bounded. */
export class InMemoryResourceTradeOfferStore implements ResourceTradeOfferStore {
  private readonly offers=new Map<string,ResourceTradeOffer>();
  rows(now:number):readonly ResourceTradeOffer[] {
    for (const row of this.offers.values()) if(row.status==="pending"&&row.expiresAt<=now) this.offers.delete(row.id);
    return [...this.offers.values()].map(clone);
  }
  insert(raw:ResourceTradeOffer):boolean {
    const row=clone(raw),rows=this.rows(row.createdAt);
    if(this.offers.has(row.id)||!hasRoom(rows,row)) return false;
    this.offers.set(row.id,row);return true;
  }
  settling(id:string):boolean {
    const row=this.offers.get(id);
    if(!row)return false;
    this.offers.set(id,{...row,status:"settling"});return true;
  }
  remove(id:string):void {this.offers.delete(id);}
  clear():void {this.offers.clear();}
}
export class SqliteResourceTradeOfferStore implements ResourceTradeOfferStore {
  constructor(private readonly db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS social_resource_trade_offers (
    id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    status TEXT NOT NULL, payload_json TEXT NOT NULL)`);}
  rows(now:number):readonly ResourceTradeOffer[] {
    this.db.prepare("DELETE FROM social_resource_trade_offers WHERE status='pending' AND expires_at<=?").run(now);
    const rows=this.db.prepare("SELECT payload_json,status FROM social_resource_trade_offers ORDER BY id LIMIT ?").all(LIMIT+1);
    if(rows.length>LIMIT)throw new RangeError("Resource trade offer store capacity exceeded");
    return rows.map(row=>ResourceTradeOfferSchema.parse({...JSON.parse(String(row.payload_json)),status:row.status}));
  }
  insert(raw:ResourceTradeOffer):boolean {
    const row=clone(raw);this.rows(row.createdAt);
    return this.db.prepare(`INSERT OR IGNORE INTO social_resource_trade_offers (id,from_id,to_id,expires_at,status,payload_json)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM social_resource_trade_offers) < ?
      AND (SELECT COUNT(*) FROM social_resource_trade_offers WHERE from_id=? OR to_id=?) < ?
      AND (SELECT COUNT(*) FROM social_resource_trade_offers WHERE from_id=? OR to_id=?) < ?`)
      .run(row.id,row.fromPlayerId,row.toPlayerId,row.expiresAt,row.status,JSON.stringify(row),LIMIT,
        row.fromPlayerId,row.fromPlayerId,PLAYER_LIMIT,row.toPlayerId,row.toPlayerId,PLAYER_LIMIT).changes>0;
  }
  settling(id:string):boolean {return this.db.prepare("UPDATE social_resource_trade_offers SET status='settling' WHERE id=?").run(id).changes>0;}
  remove(id:string):void {this.db.prepare("DELETE FROM social_resource_trade_offers WHERE id=?").run(id);}
  clear():void {this.db.exec("DELETE FROM social_resource_trade_offers");}
}
