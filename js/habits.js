/* Was im Tagebuch wirklich gewählt wird: Anzahl, zuletzt, letzte Portion. Rein lokal. */
import { FOODDB } from "./data/foods.js";
import { nm } from "./util.js";
import { scoreFood } from "./nutrition.js";
import { dishFits } from "./dish-ai.js";

let foodsByLength = null;
function foodList(){
  if (foodsByLength) return foodsByLength;
  foodsByLength = FOODDB.map(f => ({ n: f.n, key: nm(f.n) })).filter(f => f.key).sort((a, b) => b.key.length - a.key.length);
  return foodsByLength;
}

export function habitScore(h, now){
  if (!h || !(h.c > 0)) return 0;
  const days = Math.max(0, ((now || Date.now()) - (h.t || 0)) / 86400000);
  return h.c * 10 + Math.max(0, 14 - days);
}

export function rankFoods(foods, q, habits, now){
  const when = now || Date.now();
  return foods.slice().sort((a, b) => {
    const ha = habitScore(habits && habits[nm(a.n)], when);
    const hb = habitScore(habits && habits[nm(b.n)], when);
    if ((hb > 0) !== (ha > 0)) return (hb > 0) - (ha > 0);
    if (hb !== ha) return hb - ha;
    return scoreFood(b, q) - scoreFood(a, q);
  });
}

function portionOf(rest){
  const m = /^\s*\(([\d]+(?:[.,]\d+)?)\s+([^()]+?)(?:\s*\([^)]*\))?\s*\)\s*$/.exec(rest || "");
  if (!m) return { qty: 1, unit: "" };
  const qty = parseFloat(m[1].replace(",", "."));
  return { qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: m[2].trim() };
}

/** Aus einem gespeicherten Eintrag die Gewohnheit lesen. Lebensmittel gewinnen vor freien Namen. */
export function habitFromEntry(e){
  const raw = String(e && e.n || "").trim();
  if (!raw) return null;
  const low = nm(raw);
  for (const f of foodList()) {
    if (low === f.key || low.startsWith(f.key + " ")) {
      const at = raw.toLowerCase().indexOf(f.n.toLowerCase());
      const rest = at >= 0 ? raw.slice(at + f.n.length) : "";
      const port = portionOf(rest);
      return { key: f.key, n: f.n, c: 1, unit: port.unit, qty: port.qty, kind: "food" };
    }
  }
  const dish = raw.replace(/\s*\([^)]*(?:\([^)]*\)[^)]*)?\)\s*$/, "").trim() || raw;
  const g = /\((\d+)\s*g\)/.exec(raw);
  const out = { key: nm(dish), n: dish, c: 1, unit: "", qty: 1, kind: "dish" };
  if (g) out.g = parseInt(g[1], 10);
  if (e && Number.isFinite(Number(e.k))) out.k = Number(e.k);
  if (e && Number.isFinite(Number(e.p))) out.p = Number(e.p);
  return out.key ? out : null;
}

export function seedHabits(days, into, now){
  const map = Object.assign({}, into || {});
  const when = now || Date.now();
  for (const day of Object.keys(days || {}).sort()) {
    const t = Date.parse(day + "T12:00:00");
    const stamp = Number.isFinite(t) ? t : when;
    for (const e of days[day] || []) {
      const info = habitFromEntry(e);
      if (!info) continue;
      const h = map[info.key] || { n: info.n, c: 0, t: 0, unit: "", qty: 1, kind: info.kind };
      h.c += 1;
      if (stamp >= (h.t || 0)) {
        h.t = stamp;
        h.n = info.n;
        h.kind = info.kind;
        if (info.unit) h.unit = info.unit;
        if (info.qty) h.qty = info.qty;
        if (info.g) h.g = info.g;
        if (info.k != null) h.k = info.k;
        if (info.p != null) h.p = info.p;
      }
      map[info.key] = h;
    }
  }
  return map;
}

export function touchHabit(map, info, count){
  if (!map || !info || !info.key) return;
  const h = map[info.key] || { n: info.n, c: 0, t: 0, unit: "", qty: 1, kind: info.kind || "food" };
  h.n = info.n || h.n;
  if (info.kind) h.kind = info.kind;
  if (info.unit) h.unit = info.unit;
  if (info.qty > 0) h.qty = info.qty;
  if (info.g > 0) h.g = info.g;
  if (info.k != null) h.k = info.k;
  if (info.p != null) h.p = info.p;
  if (count) { h.c += 1; h.t = Date.now(); }
  map[info.key] = h;
  const keys = Object.keys(map);
  if (keys.length > 200) {
    keys.sort((a, b) => habitScore(map[a]) - habitScore(map[b]));
    delete map[keys[0]];
  }
}

export function applyHabitPortion(pc, h){
  if (!pc || !h) return;
  if (h.unit && h.unit !== "g" && h.unit !== "ml") pc.unitForce = h.unit;
  if (!pc.hasN && !pc.unit && h.qty > 0) pc.n = h.qty;
  if (!pc.hasN && !pc.unit && (h.unit === "g" || h.unit === "ml") && h.qty >= 20) {
    pc.n = h.qty;
    pc.hasN = true;
    pc.unit = h.unit;
  }
}

export function topHabits(habits, limit, minCount){
  const min = minCount || 1;
  return Object.keys(habits || {}).map(key => Object.assign({ key }, habits[key])).filter(h => h.c >= min && h.n).sort((a, b) => habitScore(b) - habitScore(a)).slice(0, limit || 4);
}

export function dishHabits(habits, query){
  return topHabits(habits, 8, 1).filter(h => h.kind === "dish" && h.k > 0 && dishFits(query, h.n));
}
