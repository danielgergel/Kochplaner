import { ST, ui, persist } from "./state.js";
import { esc, toast, dkey } from "./util.js";
import { CATS, shopList } from "./shopcalc.js";
import { bestOffers } from "./offer-match.js";

export const DEFAULT_OFFER_URL = "https://kochplaner-angebote.danielgergel.workers.dev";
const FRESH_MS = 12 * 60 * 60 * 1000;
const MAX_ITEMS = 40;

let busy = false;
let failAt = 0;

export function offerBase(){
  const v = String(ST.offerUrl || "").trim();
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[\w./~-]*)?$/i.test(v)) return v.replace(/\/$/, "");
  return DEFAULT_OFFER_URL;
}

export function chosenStores(){
  return (ST.stores || []).map(s => String(s).trim()).filter(s => s && s !== "Anderer");
}

export function shoppingItems(){
  const L = shopList(ST.sel || {});
  const out = [];
  const seen = new Set();
  const add = t => {
    const s = String(t || "").trim();
    if (!s || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase());
    out.push(s.slice(0, 80));
  };
  CATS.forEach(c => (L.out[c] || []).forEach(x => add(x.l)));
  (ST.extra || []).forEach(x => add(x.t));
  return out;
}

function zipOf(){
  return String(ST.plz || "").replace(/\D/g, "").slice(0, 5);
}

function cacheBox(){
  const a = ST.aoffers;
  if (!a || typeof a !== "object" || Array.isArray(a)) return { ts: 0, byItem: {}, failed: [] };
  return {
    ts: typeof a.ts === "number" ? a.ts : 0,
    at: a.at || "",
    byItem: a.byItem && typeof a.byItem === "object" ? a.byItem : {},
    failed: Array.isArray(a.failed) ? a.failed : [],
  };
}

export function stamp(ts){
  const d = new Date(ts);
  if (!ts || Number.isNaN(d.getTime())) return "";
  const p = n => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() + ", " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function euro(v){
  const n = parseFloat(String(v == null ? "" : v).replace(",", "."));
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",") + " €";
}

function untilText(u){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u || "")) return "";
  const [y, m, d] = u.split("-");
  return "gültig bis " + d + "." + m + "." + y;
}

export function searchUrls(item, zip){
  const q = encodeURIComponent(item);
  const z = encodeURIComponent(zip || "");
  return {
    marktguru: "https://www.marktguru.de/search?q=" + q + (z ? "&zipCode=" + z : ""),
    kaufda: "https://www.kaufda.de/webapp/search?q=" + encodeURIComponent(zip ? item + " " + zip : item),
  };
}

function manualHits(item){
  const today = dkey(new Date());
  return (ST.offers || []).filter(o => o && o.i && o.s && (!o.u || o.u >= today)).map(o => ({
    s: o.s, n: o.i, pr: o.pr || "", unit: "", up: "", upu: "", u: o.u || "", url: "", manual: true,
  }));
}

export function hitsFor(item){
  const box = cacheBox();
  const auto = Array.isArray(box.byItem[item]) ? box.byItem[item] : [];
  return bestOffers(item, auto.concat(manualHits(item)), 3);
}

function online(){
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function itemOfferHtml(item, hits, opts){
  const o = opts || {};
  const rows = (hits || []).map(h => {
    const price = euro(h.pr);
    const grund = h.up ? "Grundpreis " + euro(h.up) + (h.upu ? "/" + esc(h.upu) : "") : "";
    const bits = [h.s ? esc(h.s) : "", esc(h.n || "")].filter(Boolean).join(" · ");
    const meta = [price, h.unit ? esc(h.unit) : "", grund, untilText(h.u)].filter(Boolean).join(" · ");
    const link = h.url ? ` <a class="chipb" href="${esc(h.url)}" target="_blank" rel="noopener">Angebot</a>` : "";
    return `<span class="meta" style="display:block">${bits}</span><span class="meta" style="display:block">${meta}${link}</span>`;
  }).join("");
  let links = "";
  if (o.fallback) {
    const u = searchUrls(item, o.zip || "");
    links = `<div class="alts" style="margin-top:6px"><a class="chipb" href="${esc(u.marktguru)}" target="_blank" rel="noopener">marktguru</a><a class="chipb" href="${esc(u.kaufda)}" target="_blank" rel="noopener">kaufDA</a></div>`;
  }
  const empty = rows ? "" : `<span class="meta" style="display:block">${o.skipped ? "Dieser Artikel wurde nicht geprüft." : "Kein passendes Angebot."}</span>`;
  return `<div class="ofr"><b>${esc(item)}</b>${empty}${rows}${links}</div>`;
}

export function offersHtml(){
  const items = shoppingItems();
  const zip = zipOf();
  const box = cacheBox();
  const err = !!ui.offerErr || !online();
  const when = stamp(box.ts);
  let status;
  if (ui.offerBusy) status = "Angebote werden gesucht …";
  else if (!zip || zip.length !== 5 || !chosenStores().length) status = "Für die Suche fehlen Postleitzahl oder Läden in den Einstellungen.";
  else if (err && when) status = "Die Angebotssuche ist gerade nicht erreichbar. Unten stehen die letzten Ergebnisse vom " + when + ".";
  else if (err) status = "Die Angebotssuche ist gerade nicht erreichbar. Für jeden Artikel kannst du die Suche im Prospekt öffnen.";
  else if (when) status = "Zuletzt geprüft am " + when + ". Die Angaben kommen von marktguru und können abweichen.";
  else status = "Mit dem Knopf sucht die App in den gewählten Läden. Ohne Netz bleibt die letzte Liste stehen.";
  const failed = new Set(box.failed || []);
  const body = items.length
    ? items.map((item, i) => itemOfferHtml(item, hitsFor(item), {
        fallback: err || failed.has(item) || i >= MAX_ITEMS,
        skipped: i >= MAX_ITEMS && !box.byItem[item],
        zip,
      })).join("")
    : '<p class="empty" style="padding:6px 0">Die Einkaufsliste ist leer.</p>';
  return `<h3 class="sec">Angebote</h3>
  <div class="box" style="padding:12px">
   <button class="btn pri" id="of-refresh" style="width:100%"${ui.offerBusy ? " disabled" : ""}>Angebote aktualisieren</button>
   <p class="note" style="margin:8px 0">${esc(status)}</p>
   ${body}
  </div>`;
}

function remember(data, items){
  const byItem = {};
  const failed = Array.isArray(data.failed) ? data.failed.map(x => String(x)) : [];
  items.slice(0, MAX_ITEMS).forEach(item => {
    const raw = (data.results || []).filter(r => r && r.item === item).map(r => ({
      s: String(r.store || "").slice(0, 40),
      n: String(r.name || "").slice(0, 160),
      pr: r.price == null ? "" : String(r.price).slice(0, 24),
      unit: String(r.unit || "").slice(0, 40),
      up: r.unitPrice == null ? "" : String(r.unitPrice).slice(0, 24),
      upu: String(r.unitPriceUnit || "").slice(0, 12),
      u: /^\d{4}-\d{2}-\d{2}$/.test(r.until || "") ? r.until : "",
      url: typeof r.url === "string" && /^https:\/\//.test(r.url) ? r.url.slice(0, 300) : "",
    }));
    byItem[item] = bestOffers(item, raw, 3);
  });
  ST.aoffers = { at: dkey(new Date()), ts: Date.now(), byItem, failed, items: [] };
  persist();
}

function redraw(){
  if (ui.tab !== "E") return;
  const y = window.scrollY;
  ui.render();
  window.scrollTo(0, y);
}

export async function refreshOffers(manual){
  if (busy) return;
  const zip = zipOf();
  const stores = chosenStores();
  const items = shoppingItems();
  if (zip.length !== 5) { if (manual) toast("Bitte eine Postleitzahl in den Einstellungen eintragen"); return; }
  if (!stores.length) { if (manual) toast("Bitte mindestens einen Laden in den Einstellungen wählen"); return; }
  if (!items.length) { if (manual) toast("Die Einkaufsliste ist leer"); return; }
  if (!online()) {
    ui.offerErr = true;
    if (manual) toast("Gerade kein Internet. Die letzten Angebote bleiben stehen.");
    redraw();
    return;
  }
  busy = true;
  ui.offerBusy = true;
  ui.offerErr = false;
  redraw();
  try {
    const res = await fetch(offerBase() + "/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zip, stores, items: items.slice(0, MAX_ITEMS) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      const err = new Error(data && data.error || "marktguru_unavailable");
      throw err;
    }
    remember(data, items);
    ui.offerErr = false;
    failAt = 0;
  } catch (e) {
    ui.offerErr = true;
    if (!manual) failAt = Date.now();
    if (manual) toast("Die Angebotssuche ist gerade nicht erreichbar.");
  } finally {
    busy = false;
    ui.offerBusy = false;
    redraw();
  }
}

export function maybeRefreshOffers(){
  if (busy || ui.offerBusy) return;
  if (!online()) return;
  const ts = Number(cacheBox().ts) || 0;
  if (ts && Date.now() - ts < FRESH_MS) return;
  if (failAt && Date.now() - failAt < 2 * 60 * 1000) return;
  if (zipOf().length !== 5 || !chosenStores().length || !shoppingItems().length) return;
  refreshOffers(false);
}
