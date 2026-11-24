/* Merkt sich lokal, was oft auf die Einkaufsliste kommt oder abgehakt wird. Für die Rezeptideen. */
import { storage, ST } from "./state.js";
import { trackBuy } from "./ideas-ai.js";

export const BUYK = "kochplaner.buy.v1";

export function loadBuys(){
  let o = null;
  try { o = JSON.parse(storage.getItem(BUYK)); } catch (e) {}
  if (!o || typeof o !== "object" || Array.isArray(o) || !o.m || typeof o.m !== "object") {
    o = { m: {}, seeded: 0 };
  }
  if (!o.seeded) {
    for (const x of Array.isArray(ST.extra) ? ST.extra : []) if (x && x.t) trackBuy(o.m, x.t);
    o.seeded = 1;
    saveBuys(o);
  }
  return o;
}
function saveBuys(o){
  try { storage.setItem(BUYK, JSON.stringify(o)); } catch (e) {}
}
export function recordBuy(text){
  try {
    const o = loadBuys();
    trackBuy(o.m, text);
    saveBuys(o);
  } catch (e) {}
}
