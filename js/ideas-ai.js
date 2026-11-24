/* Neue Rezeptideen: Profil aus Tagebuch und Einkauf bauen, KI-Antwort prüfen. Rein, ohne DOM, auch im Worker benutzt. */
import { nm } from "./util.js";

export const IDEA_MAX = 5;
const clean = (v, max) => (typeof v === "string" ? v : "").replace(/[\u2010\u2011]/g, "-").replace(/[\u00a0\u202f]/g, " ").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
function numIn(v, min, max){
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".").replace(/[^\d.]/g, "")) : NaN);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/* ---------- Einkaufsgewohnheiten: was oft auf die Liste kommt oder abgehakt wird ---------- */
export function buyKey(text){
  const core = String(text || "").replace(/\([^)]*\)/g, " ").replace(/^\s*[\d.,½¼¾\/]+\s*(g|kg|ml|l|stk|stück|el|tl|pck|packung|dose|dosen|bund|becher|glas|flasche|flaschen|beutel|x)?\.?\s+/i, " ");
  return nm(core).replace(/\b\d+(\.\d+)?\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}
export function trackBuy(map, text, now){
  if (!map || typeof map !== "object") return map;
  const key = buyKey(text);
  if (key.length < 2) return map;
  const label = clean(String(text || "").replace(/\([^)]*\)/g, " "), 40) || key;
  const h = map[key] || { n: label, c: 0, t: 0 };
  h.c += 1;
  h.t = now || Date.now();
  if (label.length <= h.n.length || !h.n) h.n = label;
  map[key] = h;
  const keys = Object.keys(map);
  if (keys.length > 150) {
    keys.sort((a, b) => buyScore(map[a], now) - buyScore(map[b], now));
    delete map[keys[0]];
  }
  return map;
}
export function buyScore(h, now){
  if (!h || !(h.c > 0)) return 0;
  const days = Math.max(0, ((now || Date.now()) - (h.t || 0)) / 86400000);
  return h.c * 10 + Math.max(0, 30 - days) / 3;
}
export function topBuys(map, limit){
  return Object.keys(map || {}).map(k => map[k]).filter(h => h && h.c > 0 && h.n).sort((a, b) => buyScore(b) - buyScore(a)).slice(0, limit || 20);
}

/* ---------- Profil für die KI ---------- */
export function diaryAverage(days, today, span){
  const keys = Object.keys(days || {}).filter(k => k < today && Array.isArray(days[k]) && days[k].length).sort().slice(-(span || 14));
  if (!keys.length) return null;
  let k = 0, p = 0;
  for (const d of keys) for (const e of days[d]) {
    const m = Number(e && e.m) || 1;
    k += (Number(e && e.k) || 0) * m;
    p += (Number(e && e.p) || 0) * m;
  }
  return { kcal: Math.round(k / keys.length), eiweiss: Math.round(p / keys.length), tage: keys.length };
}

export function buildProfile(input){
  const o = input || {};
  const oft = (o.frequent || []).slice(0, 25).map(h => clean(h.n, 50) + (h.c > 1 ? " (" + h.c + "×)" : "")).filter(Boolean);
  const avg = diaryAverage(o.days || {}, o.today || "9999-99-99", 14);
  const seen = new Set();
  const einkauf = [];
  for (const t of o.shopping || []) {
    const n = clean(String(t || "").replace(/\([^)]*\)/g, " "), 40);
    const k = buyKey(n);
    if (!n || !k || seen.has(k)) continue;
    seen.add(k);
    einkauf.push(n);
    if (einkauf.length >= 40) break;
  }
  const gekauft = topBuys(o.buys || {}, 25).map(h => clean(h.n, 40) + (h.c > 1 ? " (" + h.c + "×)" : ""));
  const rezepte = [];
  const rs = new Set();
  for (const n of o.recipes || []) {
    const c = clean(n, 50);
    if (!c || rs.has(c.toLowerCase())) continue;
    rs.add(c.toLowerCase());
    rezepte.push(c);
    if (rezepte.length >= 120) break;
  }
  const mag = (o.liked || []).map(n => clean(n, 50)).filter(Boolean).slice(0, 15);
  const goal = o.goal || {};
  return {
    oft, einkauf, gekauft, rezepte, mag,
    ziel: { kcal: Math.round(Number(goal.k) || 2100), eiweiss: Math.round(Number(goal.p) || 150) },
    schnitt: avg,
    wunsch: clean(o.wish, 80),
  };
}

export function profileUsable(p){
  return !!(p && ((p.oft && p.oft.length) || (p.einkauf && p.einkauf.length) || (p.gekauft && p.gekauft.length) || p.wunsch));
}

/* Was der Worker annimmt: nur Listen kurzer Texte und Zahlen. */
export function cleanProfile(raw){
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => clean(x, len).replace(/[^\p{L}\p{N} ,.()\/×%+-]/gu, " ").replace(/\s+/g, " ").trim()).filter(x => x.length >= 2).slice(0, n);
  const out = {
    oft: list(raw.oft, 25, 60),
    einkauf: list(raw.einkauf, 40, 40),
    gekauft: list(raw.gekauft, 25, 50),
    rezepte: list(raw.rezepte, 120, 50),
    mag: list(raw.mag, 15, 50),
    wunsch: clean(raw.wunsch, 80).replace(/[^\p{L}\p{N} ,.()\/-]/gu, " ").trim(),
    ziel: null, schnitt: null,
  };
  const z = raw.ziel || {};
  const zk = numIn(z.kcal, 800, 6000), zp = numIn(z.eiweiss, 20, 400);
  if (zk != null && zp != null) out.ziel = { kcal: Math.round(zk), eiweiss: Math.round(zp) };
  const s = raw.schnitt || {};
  const sk = numIn(s.kcal, 0, 10000), sp = numIn(s.eiweiss, 0, 600), st = numIn(s.tage, 1, 60);
  if (sk != null && sp != null && st != null) out.schnitt = { kcal: Math.round(sk), eiweiss: Math.round(sp), tage: Math.round(st) };
  if (!out.oft.length && !out.einkauf.length && !out.gekauft.length && !out.wunsch) return null;
  return out;
}

export function profileText(p){
  const lines = [];
  if (p.oft.length) lines.push("Isst und trinkt oft (Tagebuch, Anzahl): " + p.oft.join("; "));
  if (p.mag.length) lines.push("Mag besonders (Favoriten und Plan): " + p.mag.join("; "));
  if (p.einkauf.length) lines.push("Steht gerade auf der Einkaufsliste: " + p.einkauf.join("; "));
  if (p.gekauft.length) lines.push("Kauft oft ein (Anzahl): " + p.gekauft.join("; "));
  if (p.ziel) lines.push("Tagesziel: " + p.ziel.kcal + " kcal, " + p.ziel.eiweiss + " g Eiweiß");
  if (p.schnitt) lines.push("Schnitt der letzten " + p.schnitt.tage + " Tage: " + p.schnitt.kcal + " kcal, " + p.schnitt.eiweiss + " g Eiweiß");
  if (p.wunsch) lines.push("Wunsch für heute: " + p.wunsch);
  if (p.rezepte.length) lines.push("Diese Rezepte hat er schon, NICHT nochmal vorschlagen: " + p.rezepte.join("; "));
  return lines.join("\n");
}

/* ---------- KI-Antwort prüfen ---------- */
const ARTEN = new Set(["Frühstück", "Hauptmahlzeit", "Snack & Beilage", "Dessert"]);
function sameName(a, b){
  const x = nm(a), y = nm(b);
  return !!x && x === y;
}
export function ideasFromAi(data, existing){
  if (!data || typeof data !== "object" || !Array.isArray(data.rezepte)) return null;
  const have = (existing || []).map(n => nm(n));
  const out = [];
  for (const r of data.rezepte.slice(0, 8)) {
    if (!r || typeof r !== "object") continue;
    const name = clean(r.name, 80);
    if (name.length < 3) continue;
    if (have.includes(nm(name)) || out.some(o => sameName(o.name, name))) continue;
    const z = [];
    for (const row of Array.isArray(r.zutaten) ? r.zutaten.slice(0, 25) : []) {
      let line = "";
      if (typeof row === "string") line = clean(row, 100);
      else if (row && typeof row === "object") {
        const menge = typeof row.menge === "number" && Number.isFinite(row.menge) ? String(row.menge).replace(".", ",") : clean(row.menge, 12);
        line = [menge, clean(row.einheit, 12), clean(row.zutat, 70)].filter(Boolean).join(" ");
      }
      if (line.length >= 2) z.push(line);
    }
    const s = (Array.isArray(r.schritte) ? r.schritte.slice(0, 12) : []).map(x => clean(x, 300)).filter(x => x.length >= 6);
    const kcal = numIn(r.kcal, 50, 2500), eiweiss = numIn(r.eiweiss, 0, 250);
    if (z.length < 2 || !s.length || kcal == null || eiweiss == null) continue;
    const art = ARTEN.has(r.art) ? r.art : "Hauptmahlzeit";
    const zeit = clean(r.zeit, 30) || "";
    out.push({ name, warum: clean(r.warum, 220), z, s, kcal: Math.round(kcal), eiweiss: Math.round(eiweiss), zeit, art, airfryer: !!r.airfryer });
    if (out.length >= IDEA_MAX) break;
  }
  return out.length ? out : null;
}

/* Zutatenzeile -> Text für die Einkaufsliste, z. B. "200 g Mozzarella" -> "Mozzarella (200 g)". */
export function shopText(line){
  const t = String(line || "").replace(/\s+/g, " ").trim();
  const m = /^([\d.,½¼¾\/]+(?:\s*-\s*[\d.,]+)?)\s*(g|kg|ml|l|EL|TL|Stk\.?|Stück|Prise|Prisen|Bund|Dose|Dosen|Pck\.?|Packung|Becher|Glas|Zehen?|Scheiben?)?\.?\s+(.+)$/i.exec(t);
  if (!m) return t.slice(0, 60);
  const amt = (m[1] + (m[2] ? " " + m[2] : "")).trim();
  return (m[3].trim() + " (" + amt + ")").slice(0, 60);
}
const PANTRY = /^(salz|pfeffer|salz und pfeffer|salz, pfeffer|wasser|öl|olivenöl|rapsöl|speiseöl|ölspray|kochspray|gewürze?)\b/i;
export function shopLines(z){
  return (z || []).map(shopText).filter(t => t && !PANTRY.test(t.replace(/\s*\(.*$/, "")));
}
