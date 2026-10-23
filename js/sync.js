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
function chip(){
  const b = document.querySelector("#bhh");
  if (!b) return;
  b.classList.toggle("sync", ui.syncState === "online");
  b.classList.toggle("err", ui.syncState === "error");
}
export function stopSync(){
  if (unsub) { unsub(); unsub = null; }
  fbRef = null; last = {}; ready = false; ui.syncState = "off"; chip();
}
export function applyRemote(d){
  if (!d || typeof d !== "object") return;
  let ch = false, cust = false;
  SH.forEach(k => {
    const s = d[k + "S"];
    if (typeof s !== "string" || s === last[k]) return;
    const loc = JSON.stringify(ST[k] == null ? DFLT(k) : ST[k]);
    if (k !== "aoffers" && last[k] !== undefined && loc !== last[k]) return;
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
    ui.syncState = "error";
    chip();
  }).finally(() => { saving = false; if (dirty) { dirty = false; pushShared(false); } });
}
export function startSync(){
  if (!FB || !HH || HH.mode !== "cloud" || !HH.code) return;
  stopSync();
  try { last = JSON.parse(storage.getItem(SYK) || "{}") || {}; } catch (e) { last = {}; }
  fbRef = FB.doc(FB.db, "households", HH.code);
  unsub = FB.onSnapshot(fbRef, snap => {
    if (snap.metadata.hasPendingWrites) return;
    ui.syncState = snap.metadata.fromCache ? "off" : "online";
    chip();
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
  }, () => { ui.syncState = "error"; chip(); });
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
  if (dUnsub) { dUnsub(); dUnsub = null; }
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
    ui.dState = "online";
    dPreferLocal = false;
  }).catch(() => { ui.dState = "error"; }).finally(() => { dSaving = false; if (dDirty) { dDirty = false; dPush(false); } });
}
export function dStart(){
  if (!FB || !DC || DC.length < 16) return;
  dStop();
  dRef = FB.doc(FB.db, "diaries", DC);
  dUnsub = FB.onSnapshot(dRef, snap => {
    if (snap.metadata.hasPendingWrites) return;
    if (snap.metadata.fromCache && !snap.exists()) return;
    ui.dState = snap.metadata.fromCache ? "off" : "online";
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
  }, () => { ui.dState = "error"; });
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

export async function initFirebase(){
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { initializeFirestore, doc, onSnapshot, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = initializeApp({
      apiKey:"AIzaSyAJSl4t2Mj9uVev5jg2gcbzpQQermiZA4M",
      authDomain:"kochplaner-f70c8.firebaseapp.com",
      projectId:"kochplaner-f70c8",
      storageBucket:"kochplaner-f70c8.firebasestorage.app",
      messagingSenderId:"1049347489480",
      appId:"1:1049347489480:web:f0bcd79568d69ab1cbaffd",
    });
    const db = initializeFirestore(app, { experimentalAutoDetectLongPolling:true });
    FB = { db, doc, onSnapshot, setDoc };
    window.FB = FB;
    startSync();
    dStart();
    chip();
    if (ui.pm === "H") ui.openHh();
  } catch (e) {}
}
