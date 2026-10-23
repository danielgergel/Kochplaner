/* Strenger Abgleich zwischen Einkaufsartikel und einem Angebotsnamen.
   Die gespeicherte id der Rezepte spielt hier keine Rolle. */

const STOP = new Set([
  "bio","light","protein","high","frisch","frische","frischer","frisches",
  "mager","magere","magerer","packung","packungen","dose","roh","beutel",
  "stk","stueck","stuecke","g","kg","ml","l","el","tl","ca","und","oder",
  "mit","ohne","im","in","aus","auf","angebot","der","die","das","ein","eine",
  "dem","den","von","vom","zum","zur","nach","bedarf","original","klasse",
  "deutsch","deutsche","deutscher","deutsches","ja","gut","guenstig","plus",
  "xxl","mini","gross","grosse","grosser","klein","kleine","pro","pack",
]);

/* Mengenangaben, Verpackung und Beschreibungen, die nicht der Artikel sind. */
const EXTRA = new Set([
  "fett","packg","pckg","je","sorte","sorten","versch","gekuehlt","gekuehlte",
  "gekuehlter","gekuehltes","flasche","flaschen","fl","pfand","zzgl","hinweis",
  "entspricht","haltbar","haltbare","haltbarer","haltbares","tiefgefroren",
  "tiefgekuehlt","normalpreis","preis","standardpackung","teilstueck","teilstuecke",
]);

const TAIL = new Set([
  "marinade","mariniert","gewuerzt","gewuerzte","kraeuter","natur",
  "geraeuchert","gepockelt","gepökelt",
]);

const PREP = new Set(["filet","filets","steak","geschnetzelt","innenfilet"]);

const GROUPS = [
  ["hackfleisch","rinderhack","hack"],
  ["milch","vollmilch"],
  ["erdnussmus","erdnussbutter","erdnusscreme"],
];

const BAN = {
  milch: ["hafermilch","mandelmilch","kokosmilch","sojamilch","buttermilch","kondensmilch","milchschnitte","muellermilch","reisdrink","milchshake","milchmischgetraenk","shake"],
  vollmilch: ["hafermilch","mandelmilch","kokosmilch","sojamilch","buttermilch","kondensmilch","milchschnitte","muellermilch","milchshake","milchmischgetraenk","shake"],
  reis: ["reiswaffel","reiswaffeln","milchreis","reisdrink","reiscracker","reisnudel","reisnudeln"],
  haehnchenbrust: ["minutenschnitzel","nugget","nuggets","haehnchenfluegel","haehnchenschenkel"],
};

/* Getrennte Schreibweisen der Ausschlussliste, z. B. „Milch Reis“, „Reis Waffeln“. */
const SPLIT = {
  milch: [["milch","reis"],["hafer","milch"],["mandel","milch"],["kokos","milch"],["soja","milch"],["butter","milch"],["kondens","milch"]],
  vollmilch: [["hafer","milch"],["mandel","milch"],["kokos","milch"],["soja","milch"],["butter","milch"],["kondens","milch"]],
  reis: [["milch","reis"],["reis","waffel"],["reis","waffeln"],["reis","cracker"],["reis","nudel"],["reis","nudeln"]],
};

const APP_WORD = new Set(["app","plus","edeka","lidl","rewe","penny","aldi","kaufland","netto"]);

export function normOffer(s){
  return String(s || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawTokens(s){
  return normOffer(s).split(" ").filter(Boolean);
}

function isQty(w){
  return /^\d+$/.test(w) || /^\d+x\d+/.test(w) || /^\d+(ml|l|kg|g|mg|stk|er|cm)$/.test(w);
}

function tokensOf(s){
  return rawTokens(s).filter(w => w.length > 1 && !STOP.has(w) && !isQty(w));
}

function keepToken(w){
  return w.length > 1 && !STOP.has(w) && !EXTRA.has(w) && !isQty(w);
}

function groupOf(head){
  for (const g of GROUPS) if (g.includes(head)) return g;
  return [head];
}

function banList(head){
  const list = new Set();
  for (const h of groupOf(head)) (BAN[h] || []).forEach(b => list.add(b));
  (BAN[head] || []).forEach(b => list.add(b));
  return list;
}

function isBannedToken(token, list){
  for (const b of list) {
    if (token === b) return true;
    if (b.length >= 6 && token.startsWith(b)) return true;
  }
  return false;
}

function splitBanned(head, words){
  const pairs = [];
  for (const h of groupOf(head)) (SPLIT[h] || []).forEach(p => pairs.push(p));
  (SPLIT[head] || []).forEach(p => pairs.push(p));
  for (let i = 0; i < words.length - 1; i++) {
    for (const [a, b] of pairs) {
      if (words[i] === a && (words[i + 1] === b || words[i + 1].startsWith(b))) return true;
    }
  }
  return false;
}

function prepRest(rest){
  for (const p of PREP) if (rest === p || rest.startsWith(p)) return true;
  return false;
}

function tokenIs(token, accepted){
  if (accepted.has(token)) return true;
  for (const a of accepted) {
    if (token.startsWith(a) && token.length > a.length) {
      const rest = token.slice(a.length);
      if (a.length >= 8 && prepRest(rest)) return true;
    }
    if (token.endsWith(a) && token.length > a.length + 2) return true;
  }
  return false;
}

function offerHead(tokens){
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (TAIL.has(tokens[i])) continue;
    return tokens[i];
  }
  return "";
}

export function headNoun(label){
  const tokens = tokensOf(String(label || "").replace(/[()]/g, " "));
  return offerHead(tokens);
}

function mainPart(part){
  const i = part.indexOf("mit");
  if (i <= 0) return part;
  const next = part[i + 1] || "";
  if (APP_WORD.has(next)) return part;
  return part.slice(0, i);
}

/** true, wenn ein bedeutendes Wort dem Artikel entspricht. Menge, Fett und Packung zählen nicht. */
export function offerMatches(item, productName){
  const head = headNoun(item);
  if (!head) return false;
  const raw = rawTokens(productName);
  const words = raw.filter(keepToken);
  if (!words.length) return false;
  const list = banList(head);
  if (words.some(w => isBannedToken(w, list)) || splitBanned(head, words)) return false;
  const accepted = new Set(groupOf(head));
  const parts = [];
  let cur = [];
  for (const w of raw) {
    if (w === "oder") { parts.push(cur); cur = []; }
    else cur.push(w);
  }
  parts.push(cur);
  return parts.some(part => mainPart(part).filter(keepToken).some(w => tokenIs(w, accepted)));
}

export function priceOf(offer){
  const p = parseFloat(String(offer && offer.pr != null ? offer.pr : "").replace(",", "."));
  return Number.isFinite(p) ? p : Infinity;
}

export function unitPriceOf(offer){
  if (!offer) return null;
  const n = typeof offer.up === "number" ? offer.up : parseFloat(String(offer.up == null ? "" : offer.up).replace(",", "."));
  if (Number.isFinite(n) && n > 0) return n;
  if (typeof offer.unitPrice === "number" && offer.unitPrice > 0) return offer.unitPrice;
  return null;
}

/** Günstigster Grundpreis zuerst. Ohne Grundpreis erst danach, dann nach Stückpreis. */
export function rankOffers(list){
  return (list || []).slice().sort((a, b) => {
    const ua = unitPriceOf(a), ub = unitPriceOf(b);
    if (ua != null && ub != null && ua !== ub) return ua - ub;
    if (ua != null && ub == null) return -1;
    if (ua == null && ub != null) return 1;
    return priceOf(a) - priceOf(b);
  });
}

export function bestOffers(item, offers, limit){
  const hits = (offers || []).filter(o => offerMatches(item, o.n || o.name || ""));
  return rankOffers(hits).slice(0, limit || 3);
}
