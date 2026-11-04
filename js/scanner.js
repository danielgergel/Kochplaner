import { DY, ui, storage, OFFK, dsave } from "./state.js";
import { $, esc, toast, f1, dkey, dlabel } from "./util.js";
import { tot, addEntry, drawDy } from "./diary.js";
import { shapeProduct, validEan, defaultAmount, foodFromProduct, productFromFood, mealItemFromProduct, cleanText } from "./product.js";

let OFFC = {};
try { OFFC = JSON.parse(storage.getItem(OFFK)) || {}; } catch (e) {}
let scnStream = null, scnRun = false, scnLoaded = null, SCP = null, scTok = 0;
/* SCDONE: gesetzt, wenn der Scan für „Mahlzeit kombinieren“ läuft. SCDAY: Tag für den Eintrag. SCEAN: zuletzt gesuchte Nummer. */
let SCDONE = null, SCDAY = "", SCEAN = "", lookBusy = false;

function loadBD(){
  if (scnLoaded) return scnLoaded;
  scnLoaded = new Promise((res, rej) => {
    if (window.BarcodeDetectionAPI || window.BarcodeDetector) { res(); return; }
    const s = document.createElement("script");
    s.src = new URL("../vendor/barcode/ponyfill.min.js", import.meta.url).href;
    s.onload = res;
    s.onerror = () => { scnLoaded = null; rej(new Error("load")); };
    document.head.appendChild(s);
  });
  return scnLoaded;
}
function stopCam(){
  scnRun = false;
  if (scnStream) { scnStream.getTracks().forEach(t => t.stop()); scnStream = null; }
}
export function closeScan(){
  scTok++;
  stopCam();
  const scn = $("#scn");
  scn.hidden = true;
  scn.innerHTML = "";
  scn.classList.remove("top");
  SCDONE = null;
}
function scanShell(inner){
  $("#scn").innerHTML = `<div class="scbar"><button class="back" data-scx>Schließen</button></div><div class="scbody">${inner}</div>`;
}
/* opts: undefined = Modus unverändert lassen, null = normaler Scan fürs Tagebuch, { done } = Scan für Mahlzeit kombinieren. */
export async function openScan(opts){
  const tok = ++scTok;
  stopCam();
  const scn = $("#scn");
  if (opts !== undefined) {
    SCDONE = opts && typeof opts.done === "function" ? opts.done : null;
    if (!SCDONE) SCDAY = ui.dyk || dkey(new Date());
  }
  scn.classList.toggle("top", !!SCDONE);
  scn.hidden = false;
  scanShell(`<video id="scv" playsinline muted autoplay></video><p class="scs" id="scs">Kamera wird gestartet …</p>
   <div class="frm" style="margin-top:10px"><label class="full">Oder Nummer unter dem Barcode eintippen<input id="scm" inputmode="numeric" placeholder="4008400402222"></label><button class="btn full" data-scgo>Suchen</button></div>`);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
  } catch (e) {
    stopCam();
    const s = $("#scs");
    const denied = e && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError" || e.name === "SecurityError");
    if (s) s.textContent = denied
      ? "Die Kamera ist für diese Seite nicht erlaubt. iPhone: Einstellungen > Safari > Kamera auf „Fragen“ oder „Erlauben“ stellen, dann diese Seite neu laden. Oder tippe die Nummer unter dem Barcode ein."
      : "Kamera nicht verfügbar. Tippe die Nummer unter dem Barcode ein.";
    return;
  }
  try {
    if (tok !== scTok || scn.hidden) { stream.getTracks().forEach(t => t.stop()); return; }
    scnStream = stream;
    await loadBD();
    if (tok !== scTok) { stopCam(); return; }
    const BD = (window.BarcodeDetectionAPI && window.BarcodeDetectionAPI.BarcodeDetector) || window.BarcodeDetector;
    const det = new BD({ formats:["ean_13","ean_8","upc_a","upc_e"] });
    const v = $("#scv");
    if (!v) { stopCam(); return; }
    v.srcObject = scnStream;
    await v.play();
    $("#scs").textContent = "Halte den Barcode ruhig ins Bild.";
    scnRun = true;
    const loop = async () => {
      if (!scnRun || tok !== scTok) return;
      try {
        const c = await det.detect(v);
        if (c.length && !lookBusy) { scnRun = false; stopCam(); lookup(c[0].rawValue); return; }
      } catch (e) {}
      setTimeout(loop, 150);
    };
    loop();
  } catch (e) {
    stopCam();
    const s = $("#scs");
    if (s) s.textContent = "Der Scanner konnte nicht gestartet werden. Tippe die Nummer unter dem Barcode ein.";
  }
}
const OFF_FIELDS = "product_name,brands,nutriments,serving_size,serving_quantity,product_quantity,quantity";
async function offFetch(ean){
  const url = "https://world.openfoodfacts.org/api/v2/product/" + ean + ".json?fields=" + OFF_FIELDS;
  const get = async init => {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 10000) : null;
    try { return await fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, init)); }
    finally { if (timer) clearTimeout(timer); }
  };
  let r;
  try { r = await get({ headers:{ "X-User-Agent":"Kochplaner/1.0" } }); }
  catch (e) { r = await get({}); }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("http");
  return shapeProduct(await r.json());
}
function foodByCode(ean){
  return (DY.foods || []).find(f => f && f.b === ean && f.k1 != null) || null;
}
async function lookup(ean){
  if (lookBusy) return;
  lookBusy = true;
  try { await lookup0(ean); } finally { lookBusy = false; }
}
async function lookup0(ean){
  ean = validEan(ean);
  if (!ean) { toast("Ungültige Nummer. Ein Barcode hat 8 bis 14 Ziffern."); return; }
  SCEAN = ean;
  scanShell(`<p class="scs">Suche ${ean} …</p>`);
  const mine = foodByCode(ean);
  if (mine) { showProd(productFromFood(mine)); return; }
  let p = OFFC[ean];
  if (p && p.v !== 2) p = null;
  if (!p) {
    try { p = await offFetch(ean); }
    catch (e) {
      const net = (typeof navigator !== "undefined" && navigator.onLine === false) || !e || e.message !== "http";
      showManual(ean, net ? "net" : "http");
      return;
    }
    if (p) { OFFC[ean] = p; try { storage.setItem(OFFK, JSON.stringify(OFFC)); } catch (e) {} }
  }
  if (!p) { showManual(ean, "missing"); return; }
  showProd(p);
}
function showManual(ean, why){
  const msg = why === "missing"
    ? `Produkt ${esc(ean)} wurde nicht gefunden oder hat keine Nährwerte. Trag die Werte von der Verpackung ein. Du kannst sie unter dieser Nummer merken, dann klappt der nächste Scan.`
    : why === "net"
      ? "Keine Verbindung zu Open Food Facts. Das Nachschlagen braucht Internet. Schon gemerkte oder früher gescannte Produkte findest du auch offline. Trag die Werte von der Verpackung ein."
      : "Open Food Facts antwortet gerade nicht. Trag die Werte von der Verpackung ein.";
  scanShell(`<p class="scs">${msg}</p>
   <div class="frm"><label class="full">Name<input id="smn" value="Produkt ${esc(ean)}"></label>
   <div class="full pkg"><button data-smb="100" aria-pressed="true">Werte pro 100 g</button><button data-smb="p" aria-pressed="false">Werte pro Portion</button></div>
   <label>kcal<input id="smk" inputmode="numeric" placeholder="450"></label>
   <label>Eiweiß (g)<input id="smp" inputmode="decimal" placeholder="5"></label>
   <label class="full" id="smgw" hidden>Eine Portion wiegt (g)<input id="smg" inputmode="decimal" placeholder="30"></label>
   <label class="chk2 full"><input type="checkbox" id="smr" checked>Unter dieser Nummer merken</label>
   <button class="btn pri full" data-scman>Weiter</button></div>
   <div class="stack"><button class="btn" data-scr>Nochmal scannen</button></div>`);
}
function dayChips(){
  const t = dkey(new Date()), y = new Date();
  y.setDate(y.getDate() - 1);
  const yk = dkey(y), day = SCDAY || ui.dyk || t, other = day !== t && day !== yk;
  return `<span>Für:</span><button class="chipb" data-scday="${t}" aria-pressed="${day === t}">Heute</button><button class="chipb" data-scday="${yk}" aria-pressed="${day === yk}">Gestern</button><label class="chipb mldate" aria-pressed="${other}">${other ? esc(dlabel(day)) : "Datum"}<input type="date" id="sc-d" value="${esc(day)}" max="${t}" aria-label="Datum wählen"></label>`;
}
function showProd(p){
  SCP = { p:Object.assign({}, p) };
  const miss = p.k == null, missP = p.p == null;
  const def = defaultAmount(p);
  scanShell(`<h2 style="margin:0 0 4px;font-size:22px;line-height:1.25">${esc(p.n)}</h2>
   <p class="scs">${miss ? "Keine Nährwerte hinterlegt. Trag die Werte pro 100 g von der Verpackung ein." : `Pro 100 g: ${p.k} kcal · ${p.p == null ? "?" : f1(p.p)} g Eiweiß${p.q ? `<br>Ganze Packung (${f1(p.q)} g): ${Math.round(p.k * p.q / 100)} kcal · ${p.p == null ? "?" : f1(p.p * p.q / 100)} g Eiweiß` : ""}${p.local ? "<br>Von dir gemerkt." : ""}`}</p>
   <div class="frm">${miss ? `<label>kcal pro 100 g<input id="sck" inputmode="numeric"></label>` : ""}${missP ? `<label>Eiweiß pro 100 g<input id="scp" inputmode="decimal"></label>` : ""}
   <div class="full pkg">${p.s ? `<button data-scam="${p.s}">1 Portion (${f1(p.s)})</button>` : ""}${p.q ? `<button data-scam="${p.q / 2}">½ Packung</button><button data-scam="${p.q}">Ganze Packung (${f1(p.q)})</button>` : ""}<button data-scam="100">100</button></div>
   <div class="full scstep"><button data-scstep="-1" aria-label="Weniger">−</button><label>Menge in g oder ml<input id="sca" inputmode="decimal" value="${def}"></label><button data-scstep="1" aria-label="Mehr">+</button></div>
   <div class="full scsum" id="scsum"></div>
   ${SCDONE ? "" : `<div class="full mlday" id="scday">${dayChips()}</div><div class="full scchk" id="scchk"></div>`}
   ${SCDONE ? `<button class="btn pri full" data-scmeal>Zur Mahlzeit hinzufügen</button>` : `<button class="btn pri full" data-scadd>Ins Tagebuch eintragen</button>`}
   <button class="btn full" data-scsave>Zu „Meine Lebensmittel“ hinzufügen</button></div>
   <div class="stack"><button class="btn" data-scr>Nochmal scannen</button></div>
   <p class="note">Daten: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL). Werte können abweichen, bitte mit der Packung vergleichen.</p>`);
  scUpd();
}
function scUpd(){
  if (!SCP) return;
  const p = SCP.p, g = id => { const e = $(id); return e ? parseFloat(e.value.replace(",", ".")) || 0 : 0; };
  const a = g("#sca"), k = p.k != null ? p.k : g("#sck"), pr = p.p != null ? p.p : g("#scp");
  SCP.a = a; SCP.kk = k * a / 100; SCP.pp = pr * a / 100;
  const s = $("#scsum");
  if (s) s.textContent = Math.round(SCP.kk) + " kcal · " + f1(SCP.pp) + " g Eiweiß";
  const c = $("#scchk");
  if (c) {
    const day = SCDAY || ui.dyk, T = tot(day), G = DY.goal, restK = G.k - T.k, afterK = restK - SCP.kk, afterP = G.p - T.p - SCP.pp;
    const ok = afterK >= 0;
    c.className = "full scchk " + (ok ? "ok" : "over");
    c.innerHTML = `<b>${ok ? "Passt noch rein" : "Zu viel für heute"}</b><span>${dlabel(day)} schon ${Math.round(T.k)} von ${G.k} kcal. ${ok ? "Danach noch " + Math.round(afterK) + " kcal übrig." : "Danach " + Math.round(-afterK) + " kcal über dem Ziel."} Eiweiß: ${afterP > 0 ? "noch " + f1(afterP) + " g offen" : "Ziel erreicht"}.</span>`;
  }
}
export function warmupScanner(){
  setTimeout(() => {
    try {
      loadBD().then(() => {
        const BD = (window.BarcodeDetectionAPI && window.BarcodeDetectionAPI.BarcodeDetector) || window.BarcodeDetector;
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        return new BD({ formats:["ean_13"] }).detect(c);
      }).catch(() => {});
    } catch (e) {}
  }, 5000);
}
/* Nährwerte pro 100 g des aktuellen Produkts (aus der Datenbank oder von Hand eingetragen). */
function scValues(){
  if (!SCP) return null;
  const g = id => { const e = $(id); return e ? parseFloat(e.value.replace(",", ".")) || 0 : 0; };
  const p = SCP.p;
  return { k:p.k != null ? p.k : g("#sck"), p:p.p != null ? p.p : g("#scp") };
}
function scDone(){
  closeScan();
  if (ui.pm === "Y" && !$("#pnl").hidden) drawDy(true);
}
function scSave(){
  const v = scValues();
  if (!v || !(v.k > 0 || v.p > 0)) { toast("Bitte Nährwerte eintragen"); return false; }
  const entry = foodFromProduct(SCP.p, SCEAN, v.k, v.p);
  const i = (DY.foods || []).findIndex(x => (entry.b && x.b === entry.b) || x.n.toLowerCase() === entry.n.toLowerCase());
  if (i >= 0) DY.foods[i] = entry;
  else if (DY.foods.length >= 200) { toast("Die Liste „Meine Lebensmittel“ ist voll"); return false; }
  else DY.foods.push(entry);
  dsave();
  return true;
}

document.addEventListener("kp:scan", ev => {
  const d = ev.detail || {};
  openScan(typeof d.done === "function" ? { done:d.done } : null);
});

export function bindScanner(){
  document.addEventListener("input", ev => { if (["sca","sck","scp"].includes(ev.target.id)) scUpd(); });
  document.addEventListener("change", ev => {
    if (ev.target.id === "sc-d" && ev.target.value && ev.target.value <= dkey(new Date())) {
      SCDAY = ev.target.value;
      const x = $("#scday"); if (x) x.innerHTML = dayChips();
      scUpd();
    }
  });
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.scan !== undefined) { openScan(null); return; }
    if (t.id === "fab") { ui.dyk = dkey(new Date()); openScan(null); return; }
    if (d.scam !== undefined) { const e = $("#sca"); if (e) { e.value = d.scam; scUpd(); } return; }
    if (d.scstep !== undefined) {
      const e = $("#sca");
      if (e) {
        const cur = parseFloat(e.value.replace(",", ".")) || 0, st = cur < 100 ? 10 : 25;
        e.value = String(Math.max(st === 10 ? 10 : 25, Math.round((cur + (+d.scstep) * st) * 10) / 10));
        scUpd();
      }
      return;
    }
    if (d.scday) { SCDAY = d.scday; const x = $("#scday"); if (x) x.innerHTML = dayChips(); scUpd(); return; }
    if (d.scr !== undefined) { openScan(SCDONE ? { done:SCDONE } : null); return; }
    if (d.scx !== undefined) { closeScan(); return; }
    if (d.scgo !== undefined) { lookup(($("#scm") || {}).value || ""); return; }
    if (d.smb !== undefined) {
      document.querySelectorAll("[data-smb]").forEach(b => b.setAttribute("aria-pressed", String(b === t)));
      const w = $("#smgw"); if (w) w.hidden = d.smb !== "p";
      return;
    }
    if (d.scman !== undefined) {
      const n = cleanText(($("#smn") || {}).value || "", 80);
      const num = id => parseFloat(((($(id) || {}).value) || "").replace(",", ".")) || 0;
      let k = num("#smk"), p = num("#smp");
      const perPortion = ($("[data-smb][aria-pressed=true]") || { dataset:{} }).dataset.smb === "p";
      const g = num("#smg");
      if (!n) { toast("Bitte einen Namen eintragen"); return; }
      if (k <= 0 && p <= 0) { toast("Bitte Nährwerte eintragen"); return; }
      if (k > 900 * 10 || p > 1000) { toast("Bitte die Werte prüfen"); return; }
      if (perPortion) {
        if (!(g > 0)) { toast("Bitte das Gewicht einer Portion eintragen"); return; }
        k = k * 100 / g; p = p * 100 / g;
      }
      if (k > 900 || p > 100) { toast("Die Werte pro 100 g sind zu hoch. Bitte prüfen."); return; }
      const prod = { v:2, n, k:Math.round(k), p:Math.round(p * 10) / 10, s:perPortion ? g : null, ss:"", q:null, qs:"" };
      const rem = $("#smr");
      showProd(prod);
      if (rem && rem.checked) { if (scSave()) toast("Gemerkt unter " + SCEAN); }
      return;
    }
    if (d.scsave !== undefined && SCP) { if (scSave()) toast("Zu „Meine Lebensmittel“ hinzugefügt"); return; }
    if (d.scmeal !== undefined && SCP && SCDONE) {
      const v = scValues();
      if (!(SCP.a > 0)) { toast("Bitte eine Menge eintragen"); return; }
      if (!v || !(v.k > 0 || v.p > 0)) { toast("Bitte Nährwerte eintragen"); return; }
      const done = SCDONE;
      const item = mealItemFromProduct(SCP.p, v.k, v.p, SCP.a);
      closeScan();
      done(item);
      toast("Zur Mahlzeit hinzugefügt");
      return;
    }
    if (d.scadd !== undefined && SCP) {
      if (!(SCP.a > 0)) { toast("Bitte eine Menge eintragen"); return; }
      if (SCP.kk <= 0 && SCP.pp <= 0) { toast("Bitte Nährwerte eintragen"); return; }
      const day = SCDAY || ui.dyk;
      addEntry({ n:SCP.p.n + " (" + f1(SCP.a) + " g)", k:SCP.kk, p:SCP.pp }, day);
      if (ui.pm === "Y" && !$("#pnl").hidden) ui.dyk = day;
      scDone();
      toast("Eingetragen (" + dlabel(day) + ")");
    }
  });
}
