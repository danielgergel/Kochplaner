/* Mahlzeit kombinieren: Text zerlegen, Mengen erkennen, Lebensmittel zuordnen, Summe rechnen.
   Reine Logik ohne Oberfläche (testbar mit node). Nutzt die vorhandene Datenbank aus foods.js plus Ergänzungen aus foods-extra.js.
   Alle Werte sind grobe Durchschnittswerte. */
import { FOODDB } from "./data/foods.js";
import { EXTRA_FOODS } from "./data/foods-extra.js";
import { nm, stripPl } from "./util.js";
import { scoreFood, unitCaption, isDrink } from "./nutrition.js";

/* Ergänzungen wie die Datenbank vorbereiten (normalisierte Namen und Einheiten). Ergänzungen stehen vorn, damit sie bei Gleichstand gewinnen. */
EXTRA_FOODS.forEach(f => {
  f._a = [nm(f.n)].concat(f.a.map(nm));
  f._u = f.u.map(x => [nm(x[0]), x[1], x[0]]);
});
export const ALL_FOODS = EXTRA_FOODS.concat(FOODDB);

/* „Meine Lebensmittel“ mit Werten pro 100 g (gescannte Produkte) stehen vorn in der Suche. */
let CUSTOM = [];
export function setCustomFoods(list){
  CUSTOM = [];
  for (const f of Array.isArray(list) ? list : []) {
    if (!f || typeof f.n !== "string" || !(f.k1 >= 0)) continue;
    const g = f.g > 0 && f.g !== 100 ? f.g : 0;
    const food = { n: f.n, a: [], k: f.k1, p: f.p1 || 0, u: g ? [["Portion", g], ["g", 1]] : [["g", 1]], gr: 0, my: 1 };
    food._a = [nm(f.n)];
    food._u = food.u.map(x => [nm(x[0]), x[1], x[0]]);
    CUSTOM.push(food);
  }
}
const pool = () => (CUSTOM.length ? CUSTOM.concat(ALL_FOODS) : ALL_FOODS);

/* ---------- Zahlen und Einheiten ---------- */
const NUMW = { ein:1, eine:1, einen:1, einem:1, einer:1, eines:1, nen:1, ne:1, zwei:2, zwo:2, drei:3, vier:4, fuenf:5, sechs:6, sieben:7, acht:8, neun:9, zehn:10, elf:11, zwoelf:12,
  anderthalb:1.5, eineinhalb:1.5, zweieinhalb:2.5, dreieinhalb:3.5, paar:2 };
const HALF = new Set(["halb", "halbe", "halben", "halbes", "halber"]);
const JUNK = new Set(["ca", "circa", "etwa", "ungefaehr", "so", "noch", "ein paar"]);

/* Schreibweise der Einheit (nach nm) -> Schlüssel */
const UNITS = {
  g:"g", gr:"g", gramm:"g", kg:"kg", kilo:"kg", ml:"ml", milliliter:"ml", l:"l", liter:"l", cl:"cl",
  el:"el", essloeffel:"el", loeffel:"el", tl:"tl", teeloeffel:"tl",
  scheibe:"scheibe", scheiben:"scheibe", stueck:"stueck", stuecke:"stueck", stk:"stueck",
  portion:"portion", portionen:"portion", glas:"glas", glaeser:"glas", tasse:"tasse", tassen:"tasse", becher:"becher",
  schale:"schale", schalen:"schale", dose:"dose", dosen:"dose", flasche:"flasche", flaschen:"flasche",
  kugel:"kugel", kugeln:"kugel", riegel:"riegel", handvoll:"handvoll",
};
const GRAM_UNITS = { g:1, kg:1000, ml:1, l:1000, cl:10 };
const UNIT_LABEL = { scheibe:"Scheibe", stueck:"Stück", portion:"Portion", glas:"Glas", tasse:"Tasse", becher:"Becher", schale:"Schale", dose:"Dose", flasche:"Flasche", kugel:"Kugel", riegel:"Riegel", handvoll:"Handvoll", el:"EL", tl:"TL" };
const UNIT_DEFAULT_G = { scheibe:25, stueck:100, portion:100, glas:200, tasse:200, becher:150, schale:150, dose:330, flasche:500, kugel:50, riegel:40, handvoll:30, el:15, tl:5 };
const PLURAL = { Scheibe:"Scheiben", Portion:"Portionen", Glas:"Gläser", Tasse:"Tassen", Dose:"Dosen", Flasche:"Flaschen", Kugel:"Kugeln", Schale:"Schalen", Ecke:"Ecken", Shake:"Shakes", Teller:"Teller" };

/* Mahlzeiten, in denen „mit“ zum Namen gehört und nicht trennt */
const KEEP = ["kaffee mit milch", "tee mit milch", "kakao mit milch", "joghurt mit frucht", "proteinshake mit milch", "proteinshake mit wasser", "rührei mit speck", "rührei mit schinken", "müsli mit milch", "haferflocken mit milch", "salat mit dressing", "milch mit honig"];

/* ---------- Lebensmittel-Gruppen für Standardmengen ---------- */
const BROT = /^(mischbrot|vollkornbrot|dinkelbrot|mehrkornbrot|sonnenblumenkernbrot|sauerteigbrot|glutenfreies brot|eiweißbrot|bananenbrot)/i;
const BRAEDCH = /^(brötchen|vollkornbrötchen|dinkelbrötchen|roggenbrötchen|mohnbrötchen|sesambrötchen|kernbrötchen|burgerbrötchen)/i;
const TOAST = /^(toast|vollkorntoast|buttertoast|dinkeltoast)/i;
/* Belag ohne Mengenangabe: Gramm pro Brotscheibe bzw. Brötchen */
const TOPPING = [
  [/salami/i, 15],
  [/aufschnitt|schinken|bierschinken|mortadella|jagdwurst|teewurst|leberwurst|cervelat|bresaola|pastrami|roastbeef|lyoner|fleischwurst|rinderschinken|cabanossi/i, 25],
  [/räucherlachs/i, 30],
  [/^(käse, scheibe|käse light|gouda|edamer|emmentaler|cheddar|butterkäse|maasdamer|leerdammer|schmelzkäsescheiben|camembert|brie|gruy|appenzeller|allgäuer)/i, 25],
  [/^(butter|margarine|halbfettbutter|lätta)/i, 8],
  [/^(frischkäse|kräuterquark|ziegenfrischkäse|hummus|tzatziki|mascarpone)/i, 15],
  [/^(marmelade|honig|nutella|erdnussbutter|mandelmus|biscoff|lotus|haselnussmus|cashewmus|tahin|pflaumenmus)/i, 15],
  [/^gurkenscheiben/i, 30],
  [/^(tomate|gurke|schlangengurke|rispentomaten|cherrytomaten)/i, 30],
];
export const isBread = f => BROT.test(f.n) || TOAST.test(f.n) || BRAEDCH.test(f.n);
export function toppingGrams(f){
  for (const [re, g] of TOPPING) if (re.test(f.n)) return g;
  return 0;
}

/* ---------- Suche (Wort-/Fuzzy) ---------- */
function lev(a, b){
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/* Wortteil-/Tippfehler-Treffer, höchstens knapp unter den klaren Treffern aus scoreFood (>= 20). */
function softScore(f, qt){
  if (!qt.length) return 0;
  let best = 0;
  for (const al of f._a) {
    const at = al.split(" ").filter(w => w.length >= 3);
    let sum = 0;
    for (const x of qt) {
      let v = 0;
      for (const w of at) {
        let s = 0;
        if (x === w || stripPl(x) === stripPl(w)) s = 18;
        else if (w.length >= 5 && x.length > w.length && x.includes(w)) s = 15;
        else if (x.length >= 5 && w.length > x.length && w.includes(x)) s = 11;
        else if (x.length >= 5 && w.length >= 5 && lev(x, w) <= (x.length >= 9 ? 2 : 1)) s = 12;
        if (s > v) v = s;
      }
      sum += v;
    }
    const s = sum / qt.length * (qt.length > 1 ? 0.95 : 1);
    if (s > best) best = s;
  }
  return Math.min(best, 19);
}

const STOP = new Set(["ein", "eine", "einen", "einem", "einer", "das", "der", "die", "dem", "den", "vom", "von", "aus", "etwas", "bisschen", "dazu", "frisch", "frische", "frischer", "frisches", "scheibe", "scheiben"]);

export function cleanQuery(q){
  return nm(q).split(" ").filter(w => w && !STOP.has(w)).join(" ");
}

export function scoreMeal(f, q){
  const s = scoreFood(f, q) + (f.my && scoreFood(f, q) > 0 ? 30 : 0);
  if (s >= 20) return s;
  const qt = q.split(" ").filter(w => w.length >= 3);
  return Math.max(s, softScore(f, qt));
}

/* Beste Treffer (absteigend). Jeder hat { f, s }. */
export function matchFoodsScored(q, limit = 4){
  const c = cleanQuery(q);
  if (!c) return [];
  const seen = new Set();
  const out = [];
  const sc = pool().map(f => ({ f, s:scoreMeal(f, c) })).filter(x => x.s >= 8).sort((a, b) => b.s - a.s);
  const top = sc.length ? sc[0].s : 0;
  for (const x of sc) {
    if (out.length >= limit) break;
    if (out.length && x.s < top * 0.45) break;
    if (seen.has(x.f.n)) continue;
    seen.add(x.f.n);
    out.push(x);
  }
  return out;
}
export function matchFoods(q, limit = 4){
  return matchFoodsScored(q, limit).map(x => x.f);
}

/* ---------- Text zerlegen ---------- */
export function prep(raw){
  let s = String(raw == null ? "" : raw);
  s = s.replace(/½/g, " 0.5 ").replace(/¼/g, " 0.25 ").replace(/¾/g, " 0.75 ");
  s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (m, a, b, c) => String(+a + (+b) / (+c)));
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, (m, a, b) => String(+a / (+b)));
  s = s.replace(/(\d)§(\d)/g, "$1.$2").replace(/(\d),(\d)/g, "$1.$2");
  s = s.replace(/(\d)([a-zA-ZäöüÄÖÜß])/g, "$1 $2");
  return s;
}

export function splitMeal(text){
  let t = String(text == null ? "" : text).replace(/\r?\n/g, ",");
  t = t.replace(/(\d),(\d)/g, "$1§$2");
  for (const ph of KEEP) t = t.replace(new RegExp(ph.replace(/ /g, "\\s+"), "gi"), m => m.replace(/\s+/g, "\u0001"));
  return t.split(/\s*(?:,|;|\+|&|(?:^|\s)und(?=\s)|(?:^|\s)plus(?=\s)|(?:^|\s)mit(?=\s)|(?:^|\s)dazu(?=\s)|(?:^|\s)sowie(?=\s))\s*/i)
    .map(x => x.replace(/\u0001/g, " ").replace(/^(?:und|mit|plus|dazu|sowie)(?:\s+|$)/i, "").trim()).filter(Boolean);
}

/* Ein Teilstück: Menge, Einheit, Name. */
export function parseSegment(raw){
  const orig = String(raw).trim();
  const toks = prep(orig).split(/\s+/).map(o => ({ o, k:nm(o) })).filter(t => t.k);
  let i = 0, n = 1, hasN = false, unit = "";
  while (i < toks.length - 1 && JUNK.has(toks[i].k)) i++;
  const k0 = () => (toks[i] ? toks[i].k : "");
  if (/^\d+(\.\d+)?$/.test(k0())) {
    n = parseFloat(k0()); i++; hasN = true;
    if (k0() === "x" || k0() === "mal") i++;
  } else if (NUMW[k0()] !== undefined) {
    n = NUMW[k0()]; i++; hasN = true;
    if (n === 1 && HALF.has(k0())) { n = 0.5; i++; }
  } else if (HALF.has(k0())) {
    n = 0.5; i++; hasN = true;
  }
  if (hasN && toks[i] && UNITS[toks[i].k] && toks.length - i > 1) { unit = UNITS[toks[i].k]; i++; }
  while (toks[i] && (toks[i].k === "von" || toks[i].k === "vom")) i++;
  let rest = toks.slice(i);
  /* Menge hinten: „Joghurt 150 g“, „Brot 2 Scheiben“ */
  if (!hasN && rest.length >= 3 && UNITS[rest[rest.length - 1].k] && /^\d+(\.\d+)?$/.test(rest[rest.length - 2].k)) {
    n = parseFloat(rest[rest.length - 2].k); hasN = true; unit = UNITS[rest[rest.length - 1].k];
    rest = rest.slice(0, -2);
  } else if (!hasN && rest.length >= 2 && /^\d+(\.\d+)?$/.test(rest[rest.length - 1].k) && parseFloat(rest[rest.length - 1].k) >= 20 && parseFloat(rest[rest.length - 1].k) < 2000) {
    n = parseFloat(rest[rest.length - 1].k); hasN = true; rest = rest.slice(0, -1);
  }
  const label = rest.map(t => t.o).join(" ").replace(/^[\s\-–]+|[\s\-–]+$/g, "");
  const q = nm(label);
  return { raw:orig, label:label ? label[0].toUpperCase() + label.slice(1) : "", q, n, hasN, unit };
}

/* ---------- Einheiten und Mengen ---------- */
function findUnit(f, label){
  const nl = nm(label);
  return f._u.find(x => x[0] === nl || stripPl(x[0]) === stripPl(nl));
}
function firstNatural(f){
  return f._u.find(x => x[2] !== "g" && x[2] !== "ml") || null;
}

/* Gramm je Einheit für dieses Lebensmittel, [Anzeige, Gramm]. */
export function unitInfo(f, key){
  const label = UNIT_LABEL[key];
  if (key === "scheibe" && BROT.test(f.n)) return ["Scheibe", 40];
  const own = findUnit(f, label);
  if (own) return [own[2], own[1]];
  if (key === "el" || key === "tl") return [label, UNIT_DEFAULT_G[key]];
  if (key === "scheibe") {
    const tg = toppingGrams(f);
    return [label, tg && tg <= 30 ? Math.min(tg, 25) : UNIT_DEFAULT_G.scheibe];
  }
  if (key === "stueck" || key === "portion") {
    const p = key === "portion" ? (findUnit(f, "Teller") || findUnit(f, "Schüssel") || firstNatural(f)) : firstNatural(f);
    if (p) return [p[2], p[1]];
  }
  return [label, UNIT_DEFAULT_G[key] || 100];
}

/* Natürliche Einheit eines Lebensmittels (zum Umschalten zwischen g und Stück/Scheibe). */
export function naturalUnit(f){
  if (BROT.test(f.n)) return ["Scheibe", 40];
  const u = firstNatural(f);
  return u ? [u[2], u[1]] : null;
}

const rnd1 = x => Math.round(x * 10) / 10;

export function makeItem(f, c, ul, ug, label){
  const nat = naturalUnit(f);
  return { n:f.n, k:f.k, p:f.p, c, ul, ug, nu:nat ? nat[0] : null, nug:nat ? nat[1] : 0, lb:label || "", gr:f.gr ? 1 : 0, dr:isDrink(f) ? 1 : 0 };
}

/* Menge, wenn nichts angegeben ist (oder beim Hinzufügen per Suche). breadCount = Brotscheiben davor. */
export function defaultItem(f, label, breadCount){
  const tg = toppingGrams(f);
  if (tg) {
    const factor = breadCount > 0 ? Math.min(6, Math.max(1, Math.ceil(breadCount))) : 1;
    return makeItem(f, tg * factor, "g", 1, label);
  }
  const nat = naturalUnit(f);
  if (nat) return makeItem(f, 1, nat[0], nat[1], label);
  return makeItem(f, 100, "g", 1, label);
}

export function itemFromSegment(f, seg, breadCount){
  const label = seg.label;
  if (!seg.hasN && !seg.unit) return defaultItem(f, label, breadCount);
  if (seg.unit && GRAM_UNITS[seg.unit] !== undefined) {
    const g = seg.n * GRAM_UNITS[seg.unit];
    return makeItem(f, rnd1(g), seg.unit === "ml" || seg.unit === "l" || seg.unit === "cl" ? "ml" : "g", 1, label);
  }
  if (seg.unit) {
    const [ul, ug] = unitInfo(f, seg.unit);
    return makeItem(f, seg.n, ul, ug, label);
  }
  /* nur eine Zahl */
  if (seg.n >= 20) return makeItem(f, seg.n, "g", 1, label);
  const nat = naturalUnit(f);
  if (nat) return makeItem(f, seg.n, nat[0], nat[1], label);
  return makeItem(f, seg.n, "Portion", 100, label);
}

export function itemGrams(it){ return it.c * it.ug; }
export function itemKcal(it){ return it.por ? it.k * it.c : it.k * it.c * it.ug / 100; }
export function itemProt(it){ return it.por ? it.p * it.c : it.p * it.c * it.ug / 100; }
export function sumItems(items){
  let k = 0, p = 0;
  for (const it of items) { k += itemKcal(it); p += itemProt(it); }
  return { k, p };
}

/* Zutat von einer Einheit in Gramm (oder zurück) umschalten. */
export function toggleUnit(it){
  if (it.por) return it;
  const g = itemGrams(it);
  if (it.ul === "g" || it.ul === "ml") {
    if (it.nu && it.nug > 0) { it.ul = it.nu; it.ug = it.nug; it.c = rnd1(g / it.nug); if (it.c <= 0) it.c = 0.5; }
  } else {
    it.ul = "g"; it.ug = 1; it.c = rnd1(g);
  }
  return it;
}

/* Schrittweite für + und − */
export function stepOf(it){
  if (it.ul === "g" || it.ul === "ml") return it.c < 50 ? 5 : it.c < 200 ? 10 : 25;
  return 0.5;
}
export function stepItem(it, dir){
  const s = stepOf(it);
  const min = it.ul === "g" || it.ul === "ml" ? 5 : 0.5;
  it.c = Math.max(min, rnd1(it.c + dir * s));
  return it;
}
export function setAmount(it, c){
  const v = Number(c);
  if (!Number.isFinite(v) || v <= 0) return it;
  it.c = Math.min(it.ul === "g" || it.ul === "ml" ? 5000 : 100, rnd1(v) || v);
  return it;
}

/* Anderes Lebensmittel für dieselbe Zeile: gleiche Einheit wenn möglich, sonst gleiche Gramm. */
export function rebase(it, f){
  const g = itemGrams(it);
  const keepUnit = it.ul !== "g" && it.ul !== "ml" ? findUnit(f, it.ul) : null;
  const nat = naturalUnit(f);
  const out = makeItem(f, rnd1(g), it.ul === "ml" ? "ml" : "g", 1, it.lb);
  if (keepUnit) { out.ul = keepUnit[2]; out.ug = keepUnit[1]; out.c = rnd1(g / keepUnit[1]) || 0.5; }
  else if (nat && it.ul !== "g" && it.ul !== "ml") { out.ul = nat[0]; out.ug = nat[1]; out.c = rnd1(g / nat[1]) || 0.5; }
  return out;
}

/* Von Hand eingegebener Posten (nicht erkannt): kcal und Eiweiß pro Portion. */
export function manualItem(label, k, p){
  return { n:label, k:Number(k) || 0, p:Number(p) || 0, c:1, ul:"Portion", ug:1, nu:null, nug:0, lb:label, gr:1, por:1 };
}

/* Einheit mit Gramm in Klammern, wie im Tagebuch: „Scheiben (40 g)“, „Becher (450 g)“. */
export function unitText(it){
  if (it.ul === "g" || it.ul === "ml") return it.ul;
  if (it.por) return rnd1(it.c) === 1 ? "Portion" : "Portionen";
  const c = rnd1(it.c);
  return unitCaption(c === 1 ? it.ul : (PLURAL[it.ul] || it.ul), it.ug, !!it.dr);
}
export function amountLabel(it){
  return String(rnd1(it.c)).replace(".", ",") + " " + unitText(it);
}

/* ---------- Gesamte Eingabe ---------- */
export function parseMeal(text){
  const segs = splitMeal(text);
  const items = [], unknown = [];
  let bread = 0;
  const seen = {};
  segs.forEach((raw, idx) => {
    const seg = parseSegment(raw);
    const last = idx === segs.length - 1;
    let key = nm(raw) || String(idx);
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] > 1) key += "#" + seen[key];
    if (!seg.q) { if (nm(raw)) unknown.push({ raw, key, last }); return; }
    const sc = matchFoodsScored(seg.q, 4);
    if (!sc.length) { unknown.push({ raw, key, last }); return; }
    const foods = sc.map(x => x.f);
    const it = itemFromSegment(foods[0], seg, bread);
    it.key = key;
    it.alts = foods;
    it.ai = 0;
    it.last = last;
    items.push(it);
    if (isBread(foods[0])) bread = it.ul === "g" ? it.c / (it.nug || 40) : it.c;
    else if (!toppingGrams(foods[0])) bread = 0;
  });
  return { items, unknown };
}

/* ---------- Name ---------- */
export function shortName(n){
  return String(n).split(/ \(|, | \/ /)[0].trim();
}
export function mealName(items){
  const names = items.map(it => (it.lb || shortName(it.n)).trim()).filter(Boolean);
  let s;
  if (names.length <= 4) s = names.join(" + ");
  else s = names.slice(0, 3).join(" + ") + " + " + (names.length - 3) + " weitere";
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

/* Für Speichern und Sync: nur das Nötige. */
export function storeItem(it){
  const o = { n:it.n, k:it.k, p:it.p, c:it.c, ul:it.ul, ug:it.ug };
  if (it.lb) o.lb = it.lb;
  if (it.nu) { o.nu = it.nu; o.nug = it.nug; }
  if (it.gr) o.gr = 1;
  if (it.dr) o.dr = 1;
  if (it.por) o.por = 1;
  return o;
}

/* Antwort der KI (ai-recipe.js: mealFromAi) -> Zutaten. Datenbankwerte haben Vorrang, die KI liefert Menge und Name. */
export function mealItemsFromAi(list){
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || typeof it.n !== "string" || !(it.g > 0)) continue;
    const hit = matchFoodsScored(it.n, 1)[0];
    if (hit && hit.s >= 40) {
      const item = makeItem(hit.f, rnd1(it.g), hit.f._u.some(u => u[2] === "ml") ? "ml" : "g", 1, it.n);
      item.ki = 1;
      out.push(item);
    } else {
      out.push({ n:it.n, k:Math.round(it.k / it.g * 1000) / 10, p:Math.round(it.p / it.g * 1000) / 10, c:rnd1(it.g), ul:"g", ug:1, nu:null, nug:0, lb:it.n, gr:1, dr:0, ki:1 });
    }
  }
  return out;
}
