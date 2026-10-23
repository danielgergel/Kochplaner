/* Inoffizieller Abruf von marktguru. Der Schlüssel bleibt hier, nie in der App.
   marktguru kann die Schnittstelle jederzeit ändern. */

import { shapeOffer, dedupeOffers, sortOffers, todayBerlin } from "./shape.js";

const API_BASE = "https://api.marktguru.de/api/v1";
const SITE = "https://www.marktguru.de/";
const UA = "KochplanerAngebote/1";
const MAX_ITEMS = 40;
const PER_ITEM = 12;
const CONCURRENCY = 3;
const CACHE_S = 6 * 60 * 60;

const STORE_RULES = [
  ["REWE", /\brewe\b/],
  ["Lidl", /\blidl\b/],
  ["Penny", /\bpenny\b/],
  ["Aldi", /\baldi\b/],
  ["Edeka", /\bedeka\b|\be ?center\b|\be ?aktiv\b/],
  ["Kaufland", /\bkaufland\b/],
  ["Netto", /\bnetto\b/],
];

const ALLOWED_ORIGINS = [
  /^https:\/\/danielgergel\.github\.io$/,
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
];

export function normName(s){
  return String(s || "").toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
}

export function canonicalStore(name){
  const n = normName(name);
  for (const [label, re] of STORE_RULES) if (re.test(n)) return label;
  return "";
}

export function storeAllowed(name, wanted){
  const c = canonicalStore(name);
  if (!c) return "";
  const set = new Set((wanted || []).map(canonicalStore).filter(Boolean));
  return set.has(c) ? c : "";
}

export function compactOffer(offer, item, store, zip){
  return shapeOffer(offer, item, store, zip);
}

function json(body, status, request){
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  const origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.some(re => re.test(origin))) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type";
    headers["access-control-max-age"] = "86400";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function cacheRequest(kind, q, zip){
  return new Request("https://offers.kochplaner.internal/" + kind + "?q=" + encodeURIComponent(q) + "&zip=" + encodeURIComponent(zip));
}

async function cacheGet(request){
  try {
    if (typeof caches === "undefined" || !caches.default) return null;
    const hit = await caches.default.match(request);
    if (!hit) return null;
    return await hit.json();
  } catch (e) {
    return null;
  }
}

async function cachePut(request, value, ctx){
  try {
    if (typeof caches === "undefined" || !caches.default) return;
    const res = new Response(JSON.stringify(value), { headers: { "cache-control": "public, max-age=" + CACHE_S } });
    const job = caches.default.put(request, res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(job);
    else await job;
  } catch (e) {}
}

let memKey = "";
let secretBad = false;

function findKeys(text){
  const out = [];
  const re = /(?:x-apikey|apiKey)\s*['"]?\s*[:=]\s*['"]([^'"]{16,120})['"]/gi;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

async function readText(url){
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept": "*/*" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("site");
  const text = await res.text();
  return text.slice(0, 400000);
}

async function keyWorks(key, clientKey){
  const url = API_BASE + "/offers/search?as=web&q=test&limit=1&offset=0&zipCode=10115";
  const headers = { "user-agent": UA, "accept": "application/json", "x-apikey": key };
  if (clientKey) headers["x-clientkey"] = clientKey;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  return res.ok;
}

async function discoverKey(env){
  if (memKey) return memKey;
  const cached = await cacheGet(cacheRequest("key", "de", "1"));
  if (cached && cached.key) { memKey = cached.key; return memKey; }
  const html = await readText(SITE);
  const scripts = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && scripts.length < 6) {
    let src = m[1];
    if (src.startsWith("//")) src = "https:" + src;
    else if (src.startsWith("/")) src = "https://www.marktguru.de" + src;
    if (src.startsWith("http")) scripts.push(src);
  }
  const candidates = findKeys(html);
  for (const src of scripts) {
    try { findKeys(await readText(src)).forEach(k => candidates.push(k)); } catch (e) {}
    if (candidates.length > 8) break;
  }
  const seen = new Set();
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (await keyWorks(key, env.MARKTGURU_CLIENT_KEY || "")) {
        memKey = key;
        await cachePut(cacheRequest("key", "de", "1"), { key });
        return key;
      }
    } catch (e) {}
  }
  return "";
}

let keyPromise = null;
async function apiKey(env){
  const secret = env && env.MARKTGURU_API_KEY;
  if (secret && !secretBad) return secret;
  if (memKey) return memKey;
  if (!keyPromise) {
    keyPromise = discoverKey(env || {}).finally(() => { keyPromise = null; });
  }
  return keyPromise;
}

async function searchRaw(query, zip, key, clientKey){
  const url = new URL(API_BASE + "/offers/search");
  url.searchParams.set("as", "web");
  url.searchParams.set("q", query);
  url.searchParams.set("zipCode", zip);
  url.searchParams.set("limit", "24");
  url.searchParams.set("offset", "0");
  const headers = { "user-agent": UA, "accept": "application/json", "x-apikey": key };
  if (clientKey) headers["x-clientkey"] = clientKey;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (res.status === 401 || res.status === 403) {
    const err = new Error("auth");
    err.code = "marktguru_unauthorized";
    throw err;
  }
  if (!res.ok) {
    const err = new Error("http");
    err.code = "marktguru_unavailable";
    throw err;
  }
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

async function searchCached(query, zip, env, ctx){
  const req = cacheRequest("q", query, zip);
  const hit = await cacheGet(req);
  if (hit && Array.isArray(hit.results)) return { results: hit.results, cached: true };
  let key = await apiKey(env);
  if (!key) {
    const err = new Error("nokey");
    err.code = "marktguru_unauthorized";
    throw err;
  }
  let results;
  try {
    results = await searchRaw(query, zip, key, env.MARKTGURU_CLIENT_KEY || "");
  } catch (e) {
    if (e && e.code === "marktguru_unauthorized" && env && env.MARKTGURU_API_KEY && !secretBad) {
      secretBad = true;
      memKey = "";
      key = await discoverKey(env);
      if (!key) throw e;
      results = await searchRaw(query, zip, key, env.MARKTGURU_CLIENT_KEY || "");
    } else throw e;
  }
  await cachePut(req, { results }, ctx);
  return { results, cached: false };
}

async function pool(items, limit, fn){
  const out = new Array(items.length);
  let next = 0;
  async function run(){
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, run));
  return out;
}

function cleanBody(raw){
  if (!raw || typeof raw !== "object") return { error: "bad_request" };
  const zip = String(raw.zip == null ? "" : raw.zip).replace(/\D/g, "");
  if (zip.length !== 5) return { error: "bad_request" };
  const stores = Array.isArray(raw.stores) ? raw.stores.map(s => String(s).slice(0, 40)).slice(0, 12) : [];
  const wanted = stores.map(canonicalStore).filter(Boolean);
  if (!wanted.length) return { error: "bad_request" };
  const items = [];
  const seen = new Set();
  for (const x of (Array.isArray(raw.items) ? raw.items : [])) {
    const item = String(x || "").trim().slice(0, 80);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  if (!items.length) return { error: "bad_request" };
  return { zip, wanted, items };
}

function rowsFor(item, rawOffers, wanted, zip){
  const rows = [];
  for (const offer of rawOffers || []) {
    const names = (offer.advertisers || []).map(a => a && a.name).filter(Boolean);
    const stores = [];
    for (const name of names) {
      const store = storeAllowed(name, wanted);
      if (store && !stores.includes(store)) stores.push(store);
    }
    for (const store of stores) rows.push(compactOffer(offer, item, store, zip));
  }
  return sortOffers(dedupeOffers(rows), todayBerlin()).slice(0, PER_ITEM);
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true }, 204, request);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true }, 200, request);
    if (url.pathname !== "/offers" || request.method !== "POST") return json({ ok: false, error: "not_found" }, 404, request);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad_request" }, 400, request); }
    const clean = cleanBody(body);
    if (clean.error) return json({ ok: false, error: clean.error }, 400, request);
    let authFailed = false;
    const settled = await pool(clean.items, CONCURRENCY, async item => {
      try {
        const found = await searchCached(item, clean.zip, env || {}, ctx);
        return { item, rows: rowsFor(item, found.results, clean.wanted, clean.zip) };
      } catch (e) {
        if (e && e.code === "marktguru_unauthorized") authFailed = true;
        return { item, error: (e && e.code) || "marktguru_unavailable" };
      }
    });
    const failed = settled.filter(x => x.error).map(x => x.item);
    if (failed.length === settled.length) {
      return json({ ok: false, error: authFailed ? "marktguru_unauthorized" : "marktguru_unavailable" }, 502, request);
    }
    const results = [];
    settled.forEach(x => { if (x.rows) results.push(...x.rows); });
    return json({
      ok: true,
      zip: clean.zip,
      checkedAt: new Date().toISOString(),
      failed,
      results,
    }, 200, request);
  },
};
