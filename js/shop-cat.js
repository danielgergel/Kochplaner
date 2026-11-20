/* Kategorien für selbst eingetragene Einkaufsartikel. Dieselbe Zuordnung wie bei Rezepten, plus Mengen, Plural, Umlaute und Tippfehler. */
import { nm, stripPl } from "./util.js";
import { CATS, G, FL, MI, TR, VO, classify } from "./data/shop-rules.js";

export const GEW = "Gewürze";
export const SONST = "Sonstiges";
export const MANUAL_ORDER = CATS.concat([GEW, SONST]);

const STOP = new Set("und mit oder fuer ca circa bio frisch frische frischer frisches tk tiefkuehl gross grosse grosser klein kleine kleiner roh rohe gekocht gerieben".split(" "));
const SPICE_WORD = new Set("salz pfeffer oregano zimt chili kreuzkuemmel kuemmel muskat kurkuma curry thymian rosmarin basilikum schnittlauch petersilie dill lorbeer majoran kraeuter vanille safran kardamom koriander nelke nelken cayenne paprikaedelsuess edelsuess".split(" "));

const LISTS = [
  [FL, ["hack","hackfleisch","gehacktes","faschiertes","haehnchen","haehnchenbrust","haehnchenschenkel","huhn","huehnchen","hahnchen","pute","putenbrust","putenschnitzel","schnitzel","rinderhack","schweinefleisch","rindfleisch","fleisch","wurst","salami","schinken","speck","bacon","aufschnitt","frikadelle","boulette","gulasch","geschnetzeltes","filet","lachs","lachsfilet","fisch","fischstaebchen","garnelen","shrimps","thunfisch","seelachs","forelle","kabeljau","bratwurst","wiener","leberkaese","mortadella","sucuk","mett","hacksteak","chicken"]],
  [MI, ["milch","hmilch","vollmilch","fettarme milch","joghurt","jogurt","quark","magerquark","skyr","kaese","frischkaese","mozarella","mozzarella","feta","butter","sahne","schlagsahne","kaffeesahne","schmand","saure sahne","ei","eier","eiklar","ricotta","parmesan","gouda","emmentaler","buttermilch","frischmilch","halloumi","schafskaese"]],
  [G, ["banane","apfel","aepfel","birne","orange","zitrone","limette","traube","erdbeere","himbeere","heidelbeere","blaubeere","brombeere","kirsche","pfirsich","nektarine","pflaume","mango","ananas","melone","wassermelone","kiwi","mandarine","clementine","grapefruit","avocado","tomate","gurke","paprika","zwiebel","knoblauch","kartoffel","suesskartoffel","salat","eisberg","rucola","feldsalat","brokkoli","blumenkohl","zucchini","aubergine","karotte","moehre","lauch","porree","kohl","wirsing","spinat","pilz","champignon","ingwer","mais","erbse","bohne","fenchel","kuerbis","rote bete","radieschen","fruehlingszwiebel","schalotte","spargel","sellerie","kohlrabi","mangold","chilischote","peperoni","jalapeno","dattel","feige"]],
  [TR, ["brot","broetchen","toast","toastbrot","semmel","baguette","croissant","aufbackbroetchen","mehl","nudel","pasta","reis","haferflocken","muesli","cornflakes","tortilla","wrap","pita","knaeckebrot","zucker","pizzateig","hefeteig","backmischung","keks","zwieback","pumpernickel","vollkornbrot","ciabatta","burgerbroetchen","sandwich","oel","essig","ketchup","senf","mayonnaise","mayo","pesto","sojasauce","honig","marmelade","nutella","aufstrich","mehl","backpulver","natron","haferdrink"]],
  [GEW, ["salz","pfeffer","oregano","zimt","chili","kreuzkuemmel","kuemmel","muskat","kurkuma","curry","paprikapulver","knoblauchpulver","zwiebelpulver","chilipulver","thymian","rosmarin","basilikum","schnittlauch","petersilie","dill","lorbeer","majoran","kraeuter","vanille","safran","kardamom","koriander","cayenne","gewuerz"]],
];

const KEYWORDS = [];
for (const [cat, words] of LISTS) for (const w of words) KEYWORDS.push({ cat, w: nm(w) });

function lev(a, b){
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let low = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < low) low = cur[j];
    }
    if (low > 2) return 3;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function pluralOf(short, long){
  if (!short || !long.startsWith(short) || long === short) return false;
  const rest = long.slice(short.length);
  return rest === "n" || rest === "en" || rest === "e" || rest === "s" || rest === "er" || rest === "ern";
}

function scoreWord(full, toks, w){
  if (!w) return 0;
  if (full === w) return 100 + w.length;
  if (toks.some(t => t === w)) return 90 + w.length;
  if (toks.some(t => pluralOf(w, t) || pluralOf(t, w) || (stripPl(t) === stripPl(w) && stripPl(w).length >= 4))) return 80 + w.length;
  let f = 0;
  const near = (a, b) => {
    if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 2) return;
    const lim = Math.max(a.length, b.length) >= 10 ? 2 : 1;
    const d = lev(a, b);
    if (d <= lim) f = Math.max(f, 60 + w.length - d);
  };
  for (const t of toks) near(t, w);
  near(full, w);
  return f;
}

function bestKeyword(text){
  const full = nm(text);
  const toks = full.split(" ").filter(w => w && !STOP.has(w));
  let best = null;
  for (const k of KEYWORDS) {
    const s = scoreWord(full, toks, k.w);
    if (!best || s > best.s || (s === best.s && k.w.length > best.w.length)) best = { s, cat: k.cat, w: k.w };
  }
  return best && best.s >= 50 ? best : null;
}

function variants(s){
  const raw = String(s || "").toLowerCase().trim();
  const set = new Set();
  const add = v => { const t = String(v || "").trim(); if (t.length >= 2) set.add(t); };
  add(raw);
  add(nm(raw));
  add(nm(raw).replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü"));
  add(raw.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss"));
  for (const v of [...set]) {
    add(stripPl(v));
    if (v.length > 4 && v.endsWith("en")) add(v.slice(0, -2));
    if (v.length > 3 && v.endsWith("n")) add(v.slice(0, -1));
    if (v.length > 3 && v.endsWith("e")) add(v.slice(0, -1));
  }
  return [...set];
}

function fromClassify(text){
  for (const v of variants(text)) {
    const c = classify(v);
    if (!c) continue;
    if (c.c === VO) return TR;
    return c.c;
  }
  return "";
}

function spiceText(s){
  const n = nm(s);
  if (/\b(pulver|gemahlen|gewuerz|gewuerzmischung)\b/.test(n)) return true;
  const toks = n.split(" ").filter(t => t && !STOP.has(t));
  return toks.length > 0 && toks.every(t => SPICE_WORD.has(t) || SPICE_WORD.has(stripPl(t)));
}

const NUM = "(?:\\d+(?:[.,]\\d+)?|\\d+\\s*/\\s*\\d+|½|¼|¾)";
const WORDNUM = "(?:ein|eine|einen|einem|einer|zwei|drei|vier|fuenf|fünf|sechs|sieben|acht|neun|zehn|einhalb|halbe|halben|halbes)";
const UNIT = "(?:kg|g|gr|gramm|ml|l|liter|el|tl|stk|stueck|stück|st|x|packung|pack|pck|bund|dose|glas|becher|scheiben|scheibe|beutel)";
const LEAD = new RegExp("^(?:ca\\.?\\s*)?(?:" + NUM + "|" + WORDNUM + ")\\s*(?:" + UNIT + ")?\\s*", "i");
const TAIL = new RegExp("\\s*(?:" + NUM + ")\\s*(?:" + UNIT + ")\\s*$", "i");

export function coreText(raw){
  let t = String(raw || "").replace(/\u00a0/g, " ").replace(/(\d)(?=[a-zA-ZäöüÄÖÜß])/g, "$1 ").trim();
  let guard = 0;
  while (LEAD.test(t) && guard++ < 3) t = t.replace(LEAD, "").trim();
  t = t.replace(TAIL, "").trim();
  return t || String(raw || "").trim();
}

export function manualCategory(raw){
  const core = coreText(raw);
  if (!nm(core)) return SONST;
  if (spiceText(core)) return GEW;
  const kw = bestKeyword(core);
  if (kw && kw.s >= 80) return kw.cat;
  const via = fromClassify(core);
  if (via) return via;
  if (kw && kw.s >= 50) return kw.cat;
  return SONST;
}

export function groupManual(list){
  const buckets = new Map(MANUAL_ORDER.map(c => [c, []]));
  (list || []).forEach((x, i) => {
    if (!x || !x.t) return;
    const found = manualCategory(x.t);
    const cat = MANUAL_ORDER.includes(found) ? found : SONST;
    buckets.get(cat).push({ i, t: x.t, d: !!x.d, at: x.at });
  });
  return MANUAL_ORDER.filter(c => buckets.get(c).length).map(c => ({
    cat: c,
    rows: buckets.get(c).slice().sort((a, b) => a.t.localeCompare(b.t, "de")),
  }));
}
