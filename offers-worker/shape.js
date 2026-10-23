/* Packung, Preis und Link aus einem marktguru-Treffer. Reine Funktionen, ohne Netz. */

const TRACK = /doubleclick\.net|googleadservices|googlesyndication|adservice\.google|adform\.|criteo\.|taboola\.|outbrain\.|adnxs\.|adsrvr\.|tradedoubler|awin1\.|serving-sys|flashtalking|smartadserver|adition\.|\/ddm\/track|\/aclk/i;
const WEEK = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function num(v){
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function round2(n){
  return Math.round(n * 100) / 100;
}

function close(a, b){
  if (a == null || b == null) return false;
  const d = Math.abs(a - b);
  return d <= 0.02 || d <= Math.abs(b) * 0.05;
}

function parseDe(s){
  return parseFloat(String(s).replace(",", "."));
}

function fmtAmount(n){
  const x = round2(n);
  return String(x).replace(".", ",");
}

function normUnit(u){
  const s = String(u || "").toLowerCase().replace("ü", "u");
  if (s === "ml" || s === "milliliter") return "ml";
  if (s === "l" || s === "lt" || s === "liter" || s === "litre") return "l";
  if (s === "kg" || s === "kilo") return "kg";
  if (s === "g" || s === "gr" || s === "gramm") return "g";
  return "";
}

function showUnit(u){
  return u === "ml" || u === "l" || u === "kg" || u === "g" ? u : "";
}

function toBase(amount, unit){
  if (unit === "ml") return { qty: amount / 1000, unit: "l" };
  if (unit === "g") return { qty: amount / 1000, unit: "kg" };
  if (unit === "l" || unit === "kg") return { qty: amount, unit };
  return { qty: null, unit: "" };
}

function makePack(count, each, unit){
  const base = toBase(each, unit);
  const total = base.qty == null ? null : count * base.qty;
  const one = fmtAmount(each) + " " + showUnit(unit);
  const label = count > 1 ? count + "×" + one : one;
  return { count, each, unit, total, baseUnit: base.unit, label: label.trim() };
}

function matchPerPack(text){
  const m = String(text).match(/entspricht\s+pro\s+pack(?:ung|g)\.?\s*(\d+(?:[.,]\d+)?)/i);
  return m ? parseDe(m[1]) : null;
}

function matchMulti(text){
  const m = String(text).match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g)\b/i);
  if (!m) return null;
  const unit = normUnit(m[3]);
  if (!unit) return null;
  return makePack(parseInt(m[1], 10), parseDe(m[2]), unit);
}

function matchJe(text){
  const m = String(text).match(/je\s+(\d+(?:[.,]\d+)?)\s*[-–]?\s*(ml|l|kg|g)\b/i);
  if (!m) return null;
  const unit = normUnit(m[2]);
  if (!unit) return null;
  return makePack(1, parseDe(m[1]), unit);
}

function fromApi(offer){
  const unit = normUnit(offer && offer.unit && (offer.unit.shortName || offer.unit.name));
  const vol = num(offer && offer.volume);
  const qty = num(offer && offer.quantity);
  if (!unit) return null;
  if (qty && qty > 1 && vol && vol > 0) return makePack(qty, vol, unit);
  if (vol && vol > 0) return makePack(1, vol, unit);
  return null;
}

function fromLabel(label){
  const m = String(label || "").match(/^(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g)$/i)
    || String(label || "").match(/^(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g)$/i);
  if (!m) return null;
  if (m.length === 4) return makePack(parseInt(m[1], 10), parseDe(m[2]), normUnit(m[3]));
  return makePack(1, parseDe(m[1]), normUnit(m[2]));
}

export function splitNote(text){
  const src = String(text || "").replace(/\s+/g, " ").trim();
  const m = src.match(/hinweis:\s*mit\s+edeka\s+app(?:\s+(\d+(?:[.,]\d+)?)\s*€)?/i);
  let name = src, note = "";
  if (m) {
    const price = m[1] ? m[1].replace(".", ",") : "";
    note = price ? "Mit Edeka-App " + price + " €" : "Mit Edeka-App";
    name = src.replace(m[0], " ");
  }
  name = name.replace(/(\d+(?:,\d+)?\s*%\s*Fett)\s+\1/gi, "$1").replace(/\s+/g, " ").trim();
  return { name, note };
}

export function safeOfferUrl(url, query, zip){
  const q = new URLSearchParams({ q: String(query || "").slice(0, 80), zipCode: String(zip || "") });
  const fallback = "https://www.marktguru.de/search?" + q.toString();
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return fallback;
  if (TRACK.test(url)) return fallback;
  try {
    if (TRACK.test(new URL(url).hostname)) return fallback;
  } catch (e) {
    return fallback;
  }
  return url.slice(0, 300);
}

function day(v){
  if (!v || typeof v !== "string") return "";
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function finishPrice(pay, pack, ref){
  const total = pack && pack.total;
  let unitPrice = null;
  if (pay > 0 && total > 0) {
    const calc = pay / total;
    unitPrice = ref && close(calc, ref) ? ref : calc;
    if (!close(pay / total, unitPrice)) unitPrice = calc;
  }
  return {
    price: pay > 0 ? round2(pay) : null,
    unit: pack && pack.label ? pack.label : "",
    unitPrice: unitPrice && unitPrice > 0 ? round2(unitPrice) : null,
    unitPriceUnit: pack && pack.baseUnit || "",
  };
}

export function shapeOffer(offer, item, store, zip){
  const brand = offer && offer.brand && offer.brand.name;
  const product = offer && offer.product && offer.product.name;
  const description = offer && offer.description || "";
  const blob = [brand, product, description].filter(Boolean).join(" ");
  const cleaned = splitNote(blob);
  const perPack = matchPerPack(blob);
  const pack = matchMulti(blob) || matchJe(blob) || fromApi(offer) || fromLabel(offer && offer.fallbackUnit) || { count: 1, each: null, total: null, baseUnit: "", label: "" };
  const api = num(offer && offer.price);
  const ref = num(offer && offer.referencePrice);
  let priced;
  if (perPack && pack.count > 1 && api && close(api, pack.count * perPack)) priced = finishPrice(api, pack, ref);
  else if (perPack && api && close(api, perPack)) priced = finishPrice(perPack, makePack(1, pack.each || 1, pack.unit || "l"), perPack / ((pack.each && toBase(pack.each, pack.unit).qty) || 1));
  else if (perPack) priced = finishPrice(perPack, makePack(1, pack.each || 1, pack.unit || "l"), null);
  else if (pack.label && pack.total && api) priced = finishPrice(api, pack, ref);
  else priced = finishPrice(api || 0, pack.total ? pack : { total: null, label: pack.label || "", baseUnit: "" }, ref);

  const dates = (offer && offer.validityDates && offer.validityDates[0]) || {};
  return {
    item: String(item || "").slice(0, 80),
    store,
    name: cleaned.name.slice(0, 160),
    note: cleaned.note.slice(0, 80),
    price: priced.price,
    unit: String(priced.unit || "").slice(0, 40),
    unitPrice: priced.unitPrice,
    unitPriceUnit: priced.unitPriceUnit,
    from: day(dates.from || offer && offer.from),
    until: day(dates.to || offer && offer.until),
    url: safeOfferUrl(offer && offer.externalUrl, cleaned.name || item, zip),
  };
}

export function coreName(name){
  return splitNote(name).name
    .toLowerCase()
    .replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/\d+(?:[.,]\d+)?\s*%/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter(w => w.length > 2 && !/^\d+$/.test(w))
    .slice(0, 4)
    .join(" ");
}

export function sameOffer(a, b){
  if (!a || !b) return false;
  if ((a.store || "") !== (b.store || "")) return false;
  const pa = a.price == null ? null : round2(Number(a.price));
  const pb = b.price == null ? null : round2(Number(b.price));
  if (pa !== pb) return false;
  if ((a.from || "") !== (b.from || "") || (a.until || "") !== (b.until || "")) return false;
  const ca = coreName(a.name), cb = coreName(b.name);
  return !!ca && ca === cb;
}

function prefer(a, b){
  const score = x => (x.note ? 2 : 0) + (x.url && !TRACK.test(x.url) ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

export function dedupeOffers(rows){
  const out = [];
  for (const row of rows || []) {
    const i = out.findIndex(x => sameOffer(x, row));
    if (i < 0) out.push(row);
    else out[i] = prefer(out[i], row);
  }
  return out;
}

export function weekdayDe(iso){
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return WEEK[dt.getDay()] || "";
}

export function offerWhen(from, today){
  if (!from || !today || from <= today) return "";
  const wd = weekdayDe(from);
  return wd ? "ab " + wd + "." : "";
}

function phase(row, today){
  const from = row.from || "";
  const until = row.until || "";
  if (from && from > today) return 1;
  if (until && until < today) return 2;
  return 0;
}

export function sortOffers(rows, today){
  const t = today || "";
  return (rows || []).slice().sort((a, b) => {
    if (t) {
      const d = phase(a, t) - phase(b, t);
      if (d) return d;
    }
    const ua = a.unitPrice == null ? 1e12 : Number(a.unitPrice);
    const ub = b.unitPrice == null ? 1e12 : Number(b.unitPrice);
    if (ua !== ub) return ua - ub;
    return (Number(a.price) || 0) - (Number(b.price) || 0);
  });
}

export function todayBerlin(now){
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now || new Date());
  } catch (e) {
    return (now || new Date()).toISOString().slice(0, 10);
  }
}
