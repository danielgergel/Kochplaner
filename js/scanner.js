import { DY, ui, storage, OFFK } from "./state.js";
import { $, esc, toast, f1, dkey, dlabel } from "./util.js";
import { tot, addEntry, drawDy } from "./diary.js";

let OFFC = {};
try { OFFC = JSON.parse(storage.getItem(OFFK)) || {}; } catch (e) {}
let scnStream = null, scnRun = false, scnLoaded = null, SCP = null, scTok = 0;

function loadBD(){
  if (scnLoaded) return scnLoaded;
  scnLoaded = new Promise((res, rej) => {
    if (window.BarcodeDetectionAPI || window.BarcodeDetector) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/barcode-detector@3.1.2/dist/iife/ponyfill.min.js";
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
}
function scanShell(inner){
  $("#scn").innerHTML = `<div class="scbar"><button class="back" data-scx>Schließen</button></div><div class="scbody">${inner}</div>`;
}
export async function openScan(){
  const tok = ++scTok;
  stopCam();
  const scn = $("#scn");
  scn.hidden = false;
  scanShell(`<video id="scv" playsinline muted autoplay></video><p class="scs" id="scs">Kamera wird gestartet …</p>
   <div class="frm" style="margin-top:10px"><label class="full">Oder Nummer unter dem Barcode eintippen<input id="scm" inputmode="numeric" placeholder="4008400402222"></label><button class="btn full" data-scgo>Suchen</button></div>`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
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
        if (c.length) { scnRun = false; stopCam(); lookup(c[0].rawValue); return; }
      } catch (e) {}
      setTimeout(loop, 150);
    };
    loop();
  } catch (e) {
    stopCam();
    const s = $("#scs");
    if (s) s.textContent = "Kamera nicht verfügbar. Tippe die Nummer unter dem Barcode ein.";
  }
}
async function offFetch(ean){
  const url = "https://world.openfoodfacts.org/api/v2/product/" + ean + ".json?fields=product_name,brands,nutriments,serving_size,serving_quantity";
  let r;
  try { r = await fetch(url, { headers:{ "X-User-Agent":"Kochplaner/1.0 (github.com/danielgergel/Kochplaner)" } }); }
  catch (e) { r = await fetch(url); }
  if (!r.ok) throw new Error("http");
  const j = await r.json();
  const pr = j && j.product;
  if (!pr) return null;
  const nu = pr.nutriments || {};
  let k = nu["energy-kcal_100g"];
  if (k == null && nu["energy_100g"] != null) k = nu["energy_100g"] / 4.184;
  const pp = nu["proteins_100g"];
  return {
    v:2,
    n:((pr.brands ? String(pr.brands).split(",")[0] + " " : "") + (pr.product_name || "Unbekanntes Produkt")).trim(),
    k:k == null ? null : Math.round(k),
    p:pp == null ? null : Math.round(pp * 10) / 10,
    s:parseFloat(pr.serving_quantity) || null,
    ss:pr.serving_size || "",
    q:parseFloat(pr.product_quantity) || null,
    qs:pr.quantity || "",
  };
}
async function lookup(ean){
  ean = String(ean).replace(/\D/g, "");
  if (ean.length < 8) { toast("Ungültige Nummer"); return; }
  scanShell(`<p class="scs">Suche ${ean} …</p>`);
  let p = OFFC[ean];
  if (p && p.v !== 2) p = null;
  if (!p) {
    try { p = await offFetch(ean); }
    catch (e) {
      scanShell(`<p class="scs">Keine Verbindung zu Open Food Facts. Versuche es später noch einmal.</p><div class="stack"><button class="btn" data-scr>Nochmal scannen</button></div>`);
      return;
    }
    if (p) { OFFC[ean] = p; try { storage.setItem(OFFK, JSON.stringify(OFFC)); } catch (e) {} }
  }
  if (!p) {
    scanShell(`<p class="scs">Produkt ${ean} wurde nicht gefunden. Du kannst es unter „Eigener Eintrag“ selbst eintragen.</p><div class="stack"><button class="btn" data-scr>Nochmal scannen</button></div>`);
    return;
  }
  showProd(p);
}
function showProd(p){
  SCP = { p:Object.assign({}, p) };
  const miss = p.k == null, missP = p.p == null;
  scanShell(`<h2 style="margin:0 0 4px;font-size:22px;line-height:1.25">${esc(p.n)}</h2>
   <p class="scs">${miss ? "Keine Nährwerte hinterlegt. Trag die Werte pro 100 g von der Verpackung ein." : `Pro 100 g: ${p.k} kcal · ${p.p == null ? "?" : f1(p.p)} g Eiweiß${p.q ? `<br>Ganze Packung (${f1(p.q)} g): ${Math.round(p.k * p.q / 100)} kcal · ${p.p == null ? "?" : f1(p.p * p.q / 100)} g Eiweiß` : ""}`}</p>
   <div class="frm">${miss ? `<label>kcal pro 100 g<input id="sck" inputmode="numeric"></label>` : ""}${missP ? `<label>Eiweiß pro 100 g<input id="scp" inputmode="decimal"></label>` : ""}
   <div class="full pkg">${p.q ? `<button data-scam="${p.q}">Ganze Packung (${f1(p.q)})</button><button data-scam="${p.q / 2}">½ Packung</button>` : ""}${p.s ? `<button data-scam="${p.s}">1 Portion (${f1(p.s)})</button>` : ""}<button data-scam="100">100</button></div>
   <label class="full">Menge in g oder ml<input id="sca" inputmode="decimal" value="${p.q || p.s || 100}"></label>
   <div class="full scsum" id="scsum"></div>
   <div class="full scchk" id="scchk"></div>
   <button class="btn pri full" data-scadd>Ins Tagebuch eintragen</button></div>
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
    const T = tot(ui.dyk), G = DY.goal, restK = G.k - T.k, afterK = restK - SCP.kk, afterP = G.p - T.p - SCP.pp;
    const ok = afterK >= 0;
    c.className = "full scchk " + (ok ? "ok" : "over");
    c.innerHTML = `<b>${ok ? "Passt noch rein" : "Zu viel für heute"}</b><span>${dlabel(ui.dyk)} schon ${Math.round(T.k)} von ${G.k} kcal. ${ok ? "Danach noch " + Math.round(afterK) + " kcal übrig." : "Danach " + Math.round(-afterK) + " kcal über dem Ziel."} Eiweiß: ${afterP > 0 ? "noch " + f1(afterP) + " g offen" : "Ziel erreicht"}.</span>`;
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
export function bindScanner(){
  document.addEventListener("input", ev => { if (["sca","sck","scp"].includes(ev.target.id)) scUpd(); });
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.scan !== undefined) { openScan(); return; }
    if (t.id === "fab") { ui.dyk = dkey(new Date()); openScan(); return; }
    if (d.scam !== undefined) { const e = $("#sca"); if (e) { e.value = d.scam; scUpd(); } return; }
    if (d.scr !== undefined) { openScan(); return; }
    if (d.scx !== undefined) { closeScan(); return; }
    if (d.scgo !== undefined) { lookup(($("#scm") || {}).value || ""); return; }
    if (d.scadd !== undefined && SCP) {
      if (!(SCP.a > 0)) { toast("Bitte eine Menge eintragen"); return; }
      if (SCP.kk <= 0 && SCP.pp <= 0) { toast("Bitte Nährwerte eintragen"); return; }
      addEntry({ n:SCP.p.n + " (" + f1(SCP.a) + " g)", k:SCP.kk, p:SCP.pp });
      closeScan();
      if (ui.pm === "Y" && !$("#pnl").hidden) drawDy(true);
      toast("Eingetragen");
    }
  });
}
