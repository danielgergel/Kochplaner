/* Prüft und bereinigt Daten, die aus der Cloud oder aus einer Sicherungsdatei kommen. */
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_D = new Set(["Mo","Di","Mi","Do","Fr","Sa","So"]);
const WEEK_S = new Set(["F","M","H","A"]);

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

export function asNumber(v){
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/* kcal und Eiweiß: Zahlen erzwingen, Komma erlauben, Unsinn verwerfen. */
export function macro(v, max){
  const n = asNumber(v);
  if (n == null) return null;
  const x = Math.round(n * 1000) / 1000;
  if (x < 0 || x > max) return null;
  return x;
}

function str(v, max){
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export function sanitizeRecipe(r){
  if (!isObj(r)) return null;
  const id = typeof r.id === "string" && ID_RE.test(r.id) ? r.id : "";
  const n = str(r.n, 120);
  if (!id || !n) return null;
  const z = Array.isArray(r.z) ? r.z.map(x => String(x ?? "").trim()).filter(Boolean).slice(0, 80) : [];
  if (!z.length) return null;
  let steps = Array.isArray(r.s) ? r.s.map(x => String(x ?? "").trim()).filter(Boolean).slice(0, 80) : [];
  if (!steps.length) steps = ["Nach Belieben zubereiten."];
  const k = macro(r.k, 8000);
  const p = macro(r.p, 800);
  const out = {
    id, n,
    c: str(r.c, 80) || "Hauptmahlzeit (16 Uhr)",
    k: k == null ? 0 : Math.round(k),
    p: p == null ? 0 : Math.round(p),
    t: str(r.t, 40) || "–",
    z,
    s: steps,
    ns: r.ns !== false,
    pt: str(r.pt, 60) || "für 2 Personen",
    cust: 1,
  };
  const note = str(r.note, 600); if (note) out.note = note;
  const q = str(r.q, 160); if (q) out.q = q;
  const u = str(r.u, 120); if (u) out.u = u;
  const mp = str(r.mp, 160); if (mp) out.mp = mp;
  const w = asNumber(r.w);
  if (w != null && w > 0 && w <= 1) out.w = w;
  return out;
}

export function sanitizeSel(v){
  if (!isObj(v)) return undefined;
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (!ID_RE.test(k)) continue;
    const n = asNumber(val);
    if (n == null) continue;
    const r = Math.round(n);
    if (r >= 1 && r <= 9) o[k] = r;
  }
  return o;
}

function flagMap(v){
  if (!isObj(v)) return undefined;
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof k !== "string" || !k || k.length > 120) continue;
    if (val) o[k] = 1;
  }
  return o;
}

function flagMapId(v){
  if (!isObj(v)) return undefined;
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (!ID_RE.test(k) || !val) continue;
    o[k] = 1;
  }
  return o;
}

export function sanitizeRate(v){
  if (!isObj(v)) return undefined;
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (!ID_RE.test(k)) continue;
    const n = Math.round(asNumber(val) ?? NaN);
    if (n >= 1 && n <= 3) o[k] = n;
  }
  return o;
}

export function sanitizeWeek(v){
  if (!isObj(v)) return undefined;
  const o = {};
  for (const [d, slots] of Object.entries(v)) {
    if (!WEEK_D.has(d) || !isObj(slots)) continue;
    const row = {};
    for (const [s, id] of Object.entries(slots)) {
      if (!WEEK_S.has(s)) continue;
      if (typeof id === "string" && ID_RE.test(id)) row[s] = id;
    }
    if (Object.keys(row).length) o[d] = row;
  }
  return o;
}

export function sanitizeOffer(o){
  if (!isObj(o)) return null;
  const i = str(o.i, 120);
  const s = str(o.s, 40);
  if (!i || !s) return null;
  const out = { i, s, pr: o.pr == null ? "" : String(o.pr).trim().slice(0, 24), u: "" };
  if (typeof o.u === "string" && DATE_RE.test(o.u)) out.u = o.u;
  return out;
}

export function sanitizeOffers(v){
  if (!Array.isArray(v)) return undefined;
  return v.map(sanitizeOffer).filter(Boolean).slice(0, 200);
}

export function sanitizeExtra(v){
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const t = str(x.t, 60);
    if (!t) continue;
    out.push({ t, d: !!x.d });
    if (out.length >= 100) break;
  }
  return out;
}

export function sanitizeStringList(v, max, itemMax){
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const x of v) {
    const s = typeof x === "string" ? str(x, itemMax) : "";
    if (!s) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeAoffers(v){
  if (!isObj(v)) return undefined;
  const o = {};
  if (typeof v.at === "string" && DATE_RE.test(v.at)) o.at = v.at;
  o.items = Array.isArray(v.items) ? v.items.map(sanitizeOffer).filter(Boolean).slice(0, 400) : [];
  return o;
}

export function sanitizePlz(v){
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  return String(v).replace(/\D/g, "").slice(0, 5);
}

export function sanitizeCust(v){
  if (!Array.isArray(v)) return undefined;
  const out = [];
  const seen = new Set();
  for (const r of v) {
    const s = sanitizeRecipe(r);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
    if (out.length >= 300) break;
  }
  return out;
}

export function sanitizeField(k, v){
  switch (k) {
    case "sel": return sanitizeSel(v);
    case "sc":
    case "fr": return flagMap(v);
    case "done": return flagMapId(v);
    case "cust": return sanitizeCust(v);
    case "offers": return sanitizeOffers(v);
    case "week": return sanitizeWeek(v);
    case "rate": return sanitizeRate(v);
    case "aoffers": return sanitizeAoffers(v);
    case "plz": return sanitizePlz(v);
    case "stores": return sanitizeStringList(v, 20, 40);
    case "wish": return sanitizeStringList(v, 80, 60);
    case "extra": return sanitizeExtra(v);
    default: return undefined;
  }
}

export function sanitizeEntry(e){
  if (!isObj(e)) return null;
  const n = str(e.n, 160);
  if (!n) return null;
  const k = macro(e.k, 20000);
  const p = macro(e.p, 2000);
  if (k == null || p == null) return null;
  let m = asNumber(e.m);
  if (m == null) m = 1;
  m = Math.min(30, Math.max(0.5, Math.round(m * 100) / 100));
  const out = { n, k, p, m };
  if (typeof e.rid === "string" && ID_RE.test(e.rid)) out.rid = e.rid;
  if (e.gk) out.gk = 1;
  return out;
}

export function sanitizeFood(f){
  if (!isObj(f)) return null;
  const n = str(f.n, 160);
  if (!n) return null;
  const k = macro(f.k, 20000);
  const p = macro(f.p, 2000);
  if (k == null || p == null) return null;
  return { n, k, p };
}

export function diaryPayloadOk(raw){
  return isObj(raw) && (isObj(raw.days) || Array.isArray(raw.foods) || isObj(raw.goal));
}

export function sanitizeDiary(raw){
  const out = { goal:{ k:2100, p:150 }, days:{}, foods:[], u:0 };
  if (!isObj(raw)) return out;
  const gk = macro(raw.goal && raw.goal.k, 9000);
  const gp = macro(raw.goal && raw.goal.p, 500);
  if (gk != null && gk > 0) out.goal.k = Math.round(gk);
  if (gp != null && gp > 0) out.goal.p = Math.round(gp);
  const u = asNumber(raw.u);
  if (u != null && u >= 0) out.u = u;
  if (isObj(raw.days)) {
    for (const day of Object.keys(raw.days).filter(k => DATE_RE.test(k)).sort()) {
      if (!Array.isArray(raw.days[day])) continue;
      const list = [];
      for (const e of raw.days[day]) {
        const s = sanitizeEntry(e);
        if (s) list.push(s);
      }
      if (list.length) out.days[day] = list;
    }
  }
  if (Array.isArray(raw.foods)) {
    for (const f of raw.foods) {
      const s = sanitizeFood(f);
      if (s && !out.foods.some(x => x.n.toLowerCase() === s.n.toLowerCase())) out.foods.push(s);
      if (out.foods.length >= 200) break;
    }
  }
  return out;
}

export function sanitizeRc(v){
  if (!isObj(v)) return {};
  const o = {};
  for (const [id, box] of Object.entries(v)) {
    if (!ID_RE.test(id) || !isObj(box)) continue;
    const z = {}, s = {};
    if (isObj(box.z)) for (const [i, val] of Object.entries(box.z)) if (val && /^\d+$/.test(i)) z[i] = 1;
    if (isObj(box.s)) for (const [i, val] of Object.entries(box.s)) if (val && /^\d+$/.test(i)) s[i] = 1;
    o[id] = { z, s };
  }
  return o;
}

export function sanitizeState(raw){
  const src = isObj(raw) ? raw : {};
  const out = { v:1, u: asNumber(src.u) || 0, sel:{}, sc:{}, rc: sanitizeRc(src.rc) };
  for (const k of ["sel","sc","fr","cust","done","offers","week","rate","aoffers","plz","stores","wish","extra"]) {
    const empty = k === "plz" ? "" : (k === "cust" || k === "offers" || k === "stores" || k === "wish" || k === "extra" ? [] : {});
    const c = src[k] === undefined ? empty : sanitizeField(k, src[k]);
    out[k] = c === undefined ? empty : c;
  }
  if (!out.u) out.u = Date.now();
  return out;
}

export function sanitizeHousehold(h){
  if (!isObj(h)) return null;
  if (h.mode === "local") return { mode:"local" };
  if (h.mode === "cloud" && typeof h.code === "string" && /^[a-z0-9]{16,64}$/i.test(h.code)) {
    return { mode:"cloud", code: h.code.toLowerCase() };
  }
  return null;
}
