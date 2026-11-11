/* Vorschläge für unbekannte Gerichte im Tagebuch. Werte gelten für eine Portion. */

export function normDish(s){
  return String(s || "").toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function num(v, min, max){
  const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function dishesFromAi(data){
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.gerichte)) return null;
  const out = [];
  for (const row of data.gerichte.slice(0, 4)) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.name || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    const g = num(row.gramm, 40, 900);
    const k = num(row.kcal, 0, 2500);
    const p = num(row.eiweiss, 0, 200);
    if (name.length < 2 || g == null || k == null || p == null) continue;
    const dish = { name, g: Math.round(g), k: Math.round(k), p: Math.round(p * 10) / 10 };
    dish.g0 = dish.g;
    dish.k0 = dish.k;
    dish.p0 = dish.p;
    out.push(dish);
  }
  return out.length ? out : null;
}

export function resizeDish(d, grams){
  const g = Math.max(50, Math.min(900, Math.round(Number(grams) || 0)));
  const base = d.g0 > 0 ? d.g0 : d.g;
  return {
    name: d.name,
    g,
    k: Math.round(d.k0 * g / base),
    p: Math.round(d.p0 * g / base * 10) / 10,
    g0: d.g0,
    k0: d.k0,
    p0: d.p0,
  };
}

export function dishLabel(d){
  return "1 Portion (" + d.g + " g)";
}

export function dishEntry(d){
  return { n: d.name + " (" + dishLabel(d) + ")", k: d.k, p: d.p, m: 1, est: 1 };
}

const KEY = "kochplaner.dish.v1";
const MAX = 60;

function readMap(store){
  try {
    const raw = JSON.parse(store.getItem(KEY) || "");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch (e) {
    return {};
  }
}

export function recallDishes(store, q){
  const hit = readMap(store)[normDish(q)];
  return dishesFromAi({ gerichte: hit });
}

export function rememberDishes(store, q, list){
  const key = normDish(q);
  if (!key || !list || !list.length) return;
  const map = readMap(store);
  const slim = list.slice(0, 4).map(d => ({ name: d.name, gramm: d.g, kcal: d.k, eiweiss: d.p }));
  const next = {};
  next[key] = slim;
  for (const k of Object.keys(map)) {
    if (k === key) continue;
    next[k] = map[k];
    if (Object.keys(next).length >= MAX) break;
  }
  try { store.setItem(KEY, JSON.stringify(next)); } catch (e) {}
}
