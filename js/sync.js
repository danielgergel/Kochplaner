/* Haushalt (Plan, Liste, eigene Rezepte) und persönliches Tagebuch in Firestore. Eingehende Daten werden geprüft. */
import { ST, DY, SH, DFLT, HH, setHH, hsave, storage, SYK, DCK, DSK, setPersistHook, setDiaryHook, replaceDiary, ui } from "./state.js";
import { sanitizeField, sanitizeDiary, diaryPayloadOk } from "./validate.js";
import { rebuildAll } from "./recipes.js";
import { shopLabels } from "./shopcalc.js";
import { toast } from "./util.js";

let FB = null;
let fbRef = null, unsub = null, last = {}, ready = false, saving = false, dirty = false, joinMode = false;
let dRef = null, dUnsub = null, dReady = false, dSaving = false, dDirty = false, dTimer = null, dRestoreMode = false, dPreferLocal = false;
let DC = null;
try { DC = storage.getItem(DCK); } catch (e) {}
let dls = 0;
try { dls = parseInt(storage.getItem(DSK), 10) || 0; } catch (e) {}

export function diaryCode(){ return DC; }
export function adoptDiaryCode(code){
  DC = code || null;
  try {
    if (DC) storage.setItem(DCK, DC); else storage.removeItem(DCK);
    storage.setItem(DSK, "0");
  } catch (e) {}
  dls = 0;
}
export function diaryCodeVisible(){ return ui.dcShow; }
export function setDiaryCodeVisible(v){ ui.dcShow = v; }

const saveLast = () => { try { storage.setItem(SYK, JSON.stringify(last)); } catch (e) {} };
const dSetSync = u => { dls = u; try { storage.setItem(DSK, String(u)); } catch (e) {} };
const netDown = () => typeof navigator !== "undefined" && navigator.onLine === false;
const failState = () => netDown() ? "offline" : "error";
export function syncStatusText(){
  if (typeof window === "undefined" || !window.FB) return "Keine Verbindung zum Server, die App arbeitet lokal weiter.";
  if (ui.syncState === "online") return "Verbunden.";
  if (ui.syncState === "offline") return "Gerade kein Internet. Alles bleibt auf diesem Handy und wird gesendet, sobald wieder Netz da ist.";
  if (ui.syncState === "error") return "Verbindung gestört. Die Änderungen bleiben auf diesem Handy und werden später gesendet.";
  return "Verbinde …";
}
export function diaryStatusText(){
  if (ui.dState === "online") return "Verbunden, alles gesichert.";
  if (ui.dState === "offline") return "Gerade kein Internet. Neue Einträge bleiben auf diesem Handy und werden gesichert, sobald wieder Netz da ist.";
  if (ui.dState === "error") return "Verbindung gestört. Die Einträge bleiben auf diesem Handy und werden später gesichert.";
  return "Wird gesichert, sobald eine Verbindung besteht.";
}
function paintStatus(){
  const a = document.querySelector("#hh-st");
  if (a) a.textContent = syncStatusText();
  const b = document.querySelector("#dy-st");
  if (b) b.textContent = diaryStatusText();
}
function chip(){
  const b = document.querySelector("#bhh");
  if (b) {
    b.classList.toggle("sync", ui.syncState === "online");
    b.classList.toggle("err", ui.syncState === "error");
  }
  paintStatus();
}
function linkState(fromCache){
  if (netDown()) return "offline";
  return fromCache ? "off" : "online";
}
let retryTimer = null;
function scheduleRetry(){
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (netDown()) { scheduleRetry(); return; }
    if (HH && HH.mode === "cloud" && HH.code) startSync();
    if (DC && String(DC).length >= 16) dStart();
  }, 3000);
}
function listenFailed(err){
  const code = String(err && err.code || "");
  if (code.indexOf("permission-denied") >= 0) return;
  scheduleRetry();
}
export function stopSync(){
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
  fbRef = null; last = {}; ready = false; ui.syncState = "off"; chip();
}
export function applyRemote(d){
  if (!d || typeof d !== "object") return;
  let ch = false, cust = false;
  SH.forEach(k => {
    if (k === "aoffers") return;
    const s = d[k + "S"];
    if (typeof s !== "string" || s === last[k]) return;
    const loc = JSON.stringify(ST[k] == null ? DFLT(k) : ST[k]);
    if (last[k] !== undefined && loc !== last[k]) return;
    let parsed;
    try { parsed = JSON.parse(s); } catch (e) { return; }
    const clean = sanitizeField(k, parsed);
    if (clean === undefined) return;
    last[k] = s;
    ST[k] = clean;
    ch = true;
    if (k === "cust") cust = true;
  });
  saveLast();
  if (!ch) return;
  try { storage.setItem("kochplaner.v1", JSON.stringify(ST)); } catch (e) {}
  if (cust) rebuildAll();
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
  if (ui.openId) ui.redrawDetail();
  else if (document.querySelector("#pnl").hidden) ui.render();
  else if (ui.pm === "F") ui.refreshFridge();
}
export function pushShared(force){
  if (!fbRef || !ready || !FB) return;
  if (saving) { dirty = true; return; }
  const o = {}, sent = [], prev = {};
  SH.forEach(k => {
    if (k === "aoffers") return;
    const s = JSON.stringify(ST[k] == null ? DFLT(k) : ST[k]);
    if (force || s !== last[k]) { o[k + "S"] = s; sent.push(k); prev[k] = last[k]; last[k] = s; }
  });
  try {
    const sl = JSON.stringify(shopLabels());
    if (force || sl !== last.shopS) { o.shopS = sl; sent.push("shopS"); prev.shopS = last.shopS; last.shopS = sl; }
  } catch (e) {}
  if (!sent.length) return;
  o.u = Date.now();
  saving = true;
  FB.setDoc(fbRef, o, { merge:true }).then(saveLast).catch(() => {
    sent.forEach(k => { last[k] = prev[k]; });
    ui.syncState = failState();
    chip();
  }).finally(() => { saving = false; if (dirty) { dirty = false; pushShared(false); } });
}
export function startSync(){
  if (!FB || !HH || HH.mode !== "cloud" || !HH.code) return;
  stopSync();
  try { last = JSON.parse(storage.getItem(SYK) || "{}") || {}; } catch (e) { last = {}; }
  fbRef = FB.doc(FB.db, "households", HH.code);
  unsub = FB.onSnapshot(fbRef, snap => {
    ui.syncState = linkState(snap.metadata.fromCache);
    chip();
    if (snap.metadata.hasPendingWrites) return;
    if (!snap.exists()) {
      if (!snap.metadata.fromCache) {
        if (joinMode) {
          joinMode = false;
          setHH({ mode:"local" });
          hsave();
          stopSync();
          toast("Diesen Haushalt gibt es nicht. Bitte den Code prüfen.");
          if (ui.pm === "H" && !document.querySelector("#pnl").hidden) ui.openHh();
          return;
        }
        ready = true;
        pushShared(true);
      }
      return;
    }
    joinMode = false;
    applyRemote(snap.data());
    if (!snap.metadata.fromCache) { ready = true; pushShared(false); }
  }, err => { unsub = null; ui.syncState = failState(); chip(); listenFailed(err); });
}

function dMerge(r){
  const inc = sanitizeDiary(r);
  const sig = e => [e.n, e.k, e.p, e.m].join("|");
  Object.keys(inc.days || {}).forEach(k => {
    if (!DY.days[k]) { DY.days[k] = inc.days[k]; return; }
    const have = new Set((DY.days[k] || []).map(sig));
    inc.days[k].forEach(e => { if (!have.has(sig(e))) DY.days[k].push(e); });
  });
  (inc.foods || []).forEach(f => {
    if (!DY.foods.some(x => x.n.toLowerCase() === f.n.toLowerCase())) DY.foods.push(f);
  });
}
export function dStop(){
  if (dUnsub) { try { dUnsub(); } catch (e) {} dUnsub = null; }
  dRef = null; dReady = false; ui.dState = "off";
}
export function dPush(force){
  if (!dRef || !dReady || !FB) return;
  if (dSaving) { dDirty = true; return; }
  const u = DY.u || 0;
  if (!force && u <= dls) return;
  dSaving = true;
  FB.setDoc(dRef, { dyS:JSON.stringify(DY), u }).then(() => {
    dSetSync(u);
    ui.dState = netDown() ? "offline" : "online";
    dPreferLocal = false;
    paintStatus();
  }).catch(() => { ui.dState = failState(); paintStatus(); }).finally(() => { dSaving = false; if (dDirty) { dDirty = false; dPush(false); } });
}
export function dStart(){
  if (!FB || !DC || DC.length < 16) return;
  dStop();
  dRef = FB.doc(FB.db, "diaries", DC);
  dUnsub = FB.onSnapshot(dRef, snap => {
    ui.dState = linkState(snap.metadata.fromCache);
    paintStatus();
    if (snap.metadata.hasPendingWrites) return;
    if (snap.metadata.fromCache && !snap.exists()) return;
    if (!snap.exists()) {
      if (dRestoreMode) {
        dRestoreMode = false;
        dStop();
        DC = null;
        try { storage.removeItem(DCK); storage.removeItem(DSK); } catch (e) {}
        toast("Diesen Code gibt es nicht. Bitte prüfen.");
        if (ui.pm === "H" && !document.querySelector("#pnl").hidden) ui.openHh();
        return;
      }
      dReady = true;
      dPush(true);
      return;
    }
    dRestoreMode = false;
    if (dPreferLocal) { dReady = true; dPush(true); return; }
    let raw;
    try { raw = JSON.parse(snap.data().dyS); } catch (e) { return; }
    if (!diaryPayloadOk(raw)) return;
    const clean = sanitizeDiary(raw);
    const ru = snap.data().u || 0, lu = DY.u || 0;
    if (ru > dls && lu <= dls) {
      replaceDiary(Object.assign(clean, { u:ru }));
      dSetSync(ru);
      const a = document.activeElement;
      if (ui.pm === "Y" && !document.querySelector("#pnl").hidden && !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) ui.drawDy(true);
    } else if (lu > dls) {
      dMerge(raw);
      DY.u = Date.now();
      try { storage.setItem("kochplaner.diary.v1", JSON.stringify(DY)); } catch (e) {}
      dReady = true;
      dPush(true);
    }
    dReady = true;
  }, err => { dUnsub = null; ui.dState = failState(); paintStatus(); listenFailed(err); });
}

export function newCode(){
  const a = new Uint8Array(20);
  crypto.getRandomValues(a);
  return Array.from(a, x => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
}
export function setHousehold(code, join){
  setHH({ mode:"cloud", code });
  hsave();
  joinMode = !!join;
  try { storage.removeItem(SYK); } catch (e) {}
  startSync();
  if (!FB) toast("Keine Verbindung, Code ist gespeichert");
  ui.openHh();
}
export function leaveHousehold(){
  stopSync();
  setHH({ mode:"local" });
  hsave();
  try { storage.removeItem(SYK); } catch (e) {}
  ui.openHh();
  toast("Haushalt verlassen");
}
export function useLocalOnly(){
  setHH({ mode:"local" });
  hsave();
  ui.closePanel();
}
export function hhUrl(){
  return location.origin + location.pathname + "#h=" + HH.code;
}

export function startDiaryBackup(){
  DC = newCode();
  try { storage.setItem(DCK, DC); } catch (e) {}
  dSetSync(0);
  ui.dcShow = true;
  if (!FB) toast("Keine Verbindung, der Code ist gespeichert");
  dStart();
  ui.openHh();
}
export function joinDiary(code){
  DC = code;
  try { storage.setItem(DCK, DC); } catch (e) {}
  dSetSync(0);
  ui.dcShow = false;
  dRestoreMode = true;
  dStart();
  ui.openHh();
  toast("Wird wiederhergestellt");
}
export function stopDiaryBackup(){
  dStop();
  DC = null;
  try { storage.removeItem(DCK); storage.removeItem(DSK); } catch (e) {}
  dls = 0;
  ui.openHh();
  toast("Sicherung beendet");
}
export function preferLocalDiary(){ dPreferLocal = true; }

export function readHash(){
  const hm = (location.hash || "").match(/h=([a-z0-9]{16,64})/i);
  if (!hm) return;
  const oc = HH && HH.code;
  setHH({ mode:"cloud", code:hm[1].toLowerCase() });
  if (oc !== HH.code) { try { storage.removeItem(SYK); } catch (e) {} joinMode = true; }
  hsave();
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
}

export function wireHooks(){
  setPersistHook(() => pushShared(false));
  setDiaryHook(() => { clearTimeout(dTimer); dTimer = setTimeout(() => dPush(false), 1200); });
}

function openFirestore(initializeFirestore, app, persistentLocalCache, persistentMultipleTabManager){
  const base = { experimentalAutoDetectLongPolling:true };
  try {
    return initializeFirestore(app, Object.assign({ localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, base));
  } catch (e) {}
  try {
    return initializeFirestore(app, Object.assign({ localCache: persistentLocalCache() }, base));
  } catch (e) {}
  return initializeFirestore(app, base);
}
export async function initFirebase(){
  try {
    const { initializeApp } = await import("../vendor/firebase/firebase-app.js");
    const { initializeFirestore, doc, onSnapshot, setDoc, persistentLocalCache, persistentMultipleTabManager, setLogLevel } = await import("../vendor/firebase/firebase-firestore.js");
    setLogLevel("silent");
    const app = initializeApp({
      apiKey:"AIzaSyAJSl4t2Mj9uVev5jg2gcbzpQQermiZA4M",
      authDomain:"kochplaner-f70c8.firebaseapp.com",
      projectId:"kochplaner-f70c8",
      storageBucket:"kochplaner-f70c8.firebasestorage.app",
      messagingSenderId:"1049347489480",
      appId:"1:1049347489480:web:f0bcd79568d69ab1cbaffd",
    });
    const db = openFirestore(initializeFirestore, app, persistentLocalCache, persistentMultipleTabManager);
    FB = { db, doc, onSnapshot, setDoc };
    window.FB = FB;
    startSync();
    dStart();
    chip();
    if (ui.pm === "H") ui.openHh();
  } catch (e) {}
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    clearTimeout(retryTimer);
    retryTimer = null;
    if (HH && HH.mode === "cloud" && HH.code) startSync();
    if (DC && String(DC).length >= 16) dStart();
  });
  window.addEventListener("offline", () => {
    if (fbRef) ui.syncState = "offline";
    if (dRef) ui.dState = "offline";
    chip();
  });
}
