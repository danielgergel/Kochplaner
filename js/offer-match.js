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
  milch: ["hafermilch","mandelmilch","kokosmilch","sojamilch","buttermilch","kondensmilch","milchschnitte","muellermilch","reisdrink"],
  vollmilch: ["hafermilch","mandelmilch","kokosmilch","sojamilch","buttermilch","kondensmilch","milchschnitte","muellermilch"],
  reis: ["reiswaffel","reiswaffeln","milchreis","reisdrink","reiscracker","reisnudel","reisnudeln"],
  haehnchenbrust: ["minutenschnitzel","nugget","nuggets","haehnchenfluegel","haehnchenschenkel"],
};

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

function tokensOf(s){
  return normOffer(s).split(" ").filter(w => w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w) && !/^\d+x\d+/.test(w));
}

function groupOf(head){
  for (const g of GROUPS) if (g.includes(head)) return g;
  return [head];
}

function banned(head, token){
  const list = new Set();
  for (const h of groupOf(head)) (BAN[h] || []).forEach(b => list.add(b));
  (BAN[head] || []).forEach(b => list.add(b));
  for (const b of list) if (token === b || token.startsWith(b)) return true;
  return false;
}

function tokenIs(token, accepted){
  if (accepted.has(token)) return true;
  for (const a of accepted) {
    if (!token.startsWith(a) || token === a) continue;
    if (a.length >= 8 && PREP.has(token.slice(a.length))) return true;
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

/** true, wenn der Angebotsname denselben Kopf wie der Artikel hat. */
export function offerMatches(item, productName){
  const head = headNoun(item);
  if (!head) return false;
  const words = tokensOf(productName);
  if (!words.length) return false;
  if (words.some(w => banned(head, w))) return false;
  const accepted = new Set(groupOf(head));
  return tokenIs(offerHead(words), accepted);
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
