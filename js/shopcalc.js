import { catalog, ST } from "./state.js";
import { CATS, G, VO, TR, SPICE, classify, fmt } from "./data/shop-rules.js";

export { CATS, classify, fmt };

const PACK = { "Rinderhack (mager)":400, "Hähnchenbrust":400, "Skyr":500, "Magerquark":500, "Putenschnitzel":400 };
const LCAT = {};
const lab = {};

export function clearLabels(){
  for (const k in LCAT) delete LCAT[k];
  for (const k in lab) delete lab[k];
}
export function labelMap(){ return LCAT; }

export function labelsOf(id){
  if (lab[id]) return lab[id];
  const r = catalog.all[id];
  if (!r) return lab[id] = [];
  const set = new Set();
  r.z.forEach(zs => String(zs).split(/,\s+(?=[\d½])/).forEach(p => {
    p = p.trim().replace(/^[A-Za-zÄÖÜäöüß\- ]+:\s*/, "");
    const m = p.match(/^(½|\d+(?:[.,]\d+)?)\s*(?:(g|ml|EL|TL|Scheiben|Scheibe|Scoop|Tasse)\s+)?(.+)$/);
    if (m && (m[2] === "EL" || m[2] === "TL" || m[2] === "Tasse")) return;
    if (!m && SPICE.test(p.toLowerCase())) return;
    const c = classify(m ? m[3].split(",")[0] : p);
    if (c && c.c !== VO) { set.add(c.l); LCAT[c.l] = c.c; }
    else if (!c && (r.cust || r.id[0] === "P")) {
      const name = (m ? m[3] : p).split(",")[0].trim();
      if (name) { set.add(name); LCAT[name] = TR; }
    }
  }));
  return lab[id] = [...set];
}

export function shopList(use){
  const all = catalog.all;
  const src = {};
  Object.keys(use || {}).forEach(k => { if (all[k]) src[k] = use[k]; });
  const items = {}, need = {}, vor = new Set();
  for (const id in src) {
    const r = all[id], f = (r.ns ? 1 : 2 * (r.w || 1)) * src[id];
    r.z.forEach(zs => String(zs).split(/,\s+(?=[\d½])/).forEach(p => {
      p = p.trim().replace(/^[A-Za-zÄÖÜäöüß\- ]+:\s*/, "");
      const m = p.match(/^(½|\d+(?:[.,]\d+)?)\s*(?:(g|ml|EL|TL|Scheiben|Scheibe|Scoop|Tasse)\s+)?(.+)$/);
      if (!m) {
        if (/ketchup/i.test(p)) vor.add("Ketchup");
        if (SPICE.test(p.toLowerCase())) return;
        const c = classify(p);
        if (c) { if (c.c === VO) vor.add(c.l); else need[c.c + "|" + c.l] = 1; }
        else if (p.length <= 30) vor.add(p);
        return;
      }
      let q = m[1] === "½" ? 0.5 : parseFloat(m[1].replace(",", "."));
      let u = m[2] || "Stk";
      const rest = m[3].split(",")[0];
      let c = classify(rest);
      if (!c) {
        if (!r.cust && r.id[0] !== "P") return;
        if (SPICE.test(rest.toLowerCase())) return;
        c = { c:TR, l:rest.trim() };
      }
      if (c.c === VO) { vor.add(c.l); return; }
      if (u === "EL" || u === "TL" || u === "Tasse") { if (c.l !== "Skyr" && c.l !== "Magerquark") vor.add(c.l); return; }
      if (u === "Scoop") { q *= 30; u = "g"; }
      if (u === "Scheibe" || u === "Scheiben") { if (c.l === "Putenaufschnitt") { q *= 15; u = "g"; } else u = "Scheiben"; }
      if (c.l === "Tomaten" && u === "Stk") { q *= 120; u = "g"; }
      if (c.l === "Paprika" && u === "g") { q /= 150; u = "Stk"; }
      if (c.l === "Gurken" && u === "g") { q /= 300; u = "Stk"; }
      if (c.l === "Zwiebeln" && u === "g") { q /= 100; u = "Stk"; }
      const key = c.c + "|" + c.l + "|" + u;
      items[key] = (items[key] || 0) + q * f;
    }));
  }
  const out = {};
  CATS.forEach(c => out[c] = []);
  const have = new Set();
  Object.keys(items).sort().forEach(k => {
    const [c, l, u] = k.split("|");
    have.add(c + "|" + l);
    let q, sub = "";
    if (PACK[l] && u === "g") {
      const np = Math.ceil(items[k] / PACK[l] - 0.001);
      q = np + (np === 1 ? " Packung" : " Packungen") + " à " + PACK[l] + " g";
      sub = "gebraucht ca. " + fmt(items[k], u);
    } else q = fmt(items[k], u);
    out[c].push({ key:k, l, q, sub });
  });
  Object.keys(need).forEach(k => {
    if (!have.has(k) && !(k.endsWith("|Salat") && need[G + "|Salat / Tomate / Gurke"])) {
      const [c, l] = k.split("|");
      out[c].push({ key:k, l, q:"nach Bedarf", sub:"" });
    }
  });
  return { out, vor:[...vor].sort() };
}

export function shopLabels(){
  const L = shopList(ST.sel || {}), a = [];
  CATS.forEach(c => L.out[c].forEach(x => { if (a.indexOf(x.l) < 0) a.push(x.l); }));
  return a;
}
