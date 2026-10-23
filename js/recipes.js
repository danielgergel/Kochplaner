import { catalog, ST, ui, persist } from "./state.js";
import { $, esc, toast, ck } from "./util.js";
import { sc } from "./data/shop-rules.js";
import { labelsOf, clearLabels, labelMap } from "./shopcalc.js";
import { estimateRecipe } from "./nutrition.js";
import { NSVIDEO } from "./data/wake.js";
import { showPanel, closePanel, setDiceTimer, clearDiceTimer } from "./panels.js";
import { parseRecipeText } from "./ocr-text.js";

const ORD = "FMAISPEX";
export const GROUPS = ["Alle","★ Favoriten","Frühstück","Hauptmahlzeit","Snack & Beilage","Dessert"];
export const CGRP = { "Frühstück":"Frühstück", "Hauptmahlzeit":"Hauptmahlzeit (16 Uhr)", "Snack & Beilage":"Snack / Pause", "Dessert":"Dessert" };
const FAVG = "★ Favoriten";
const DGROUPS = ["Alle","Frühstück","Hauptmahlzeit","Snack & Beilage","Dessert"];

export function grp(r){
  const c = r.c || "";
  if (r.id[0] === "F" || /Frühstück|9-Uhr/.test(c)) return "Frühstück";
  if (c === "Dessert") return "Dessert";
  if (r.id[0] === "M" || r.id[0] === "A" || /Hauptmahlzeit/.test(c)) return "Hauptmahlzeit";
  return "Snack & Beilage";
}
export function starsOf(id){ return (ST.rate || {})[id] || 0; }
export function metaOf(r){
  return `${r.k} kcal · ${r.p} g Eiweiß · ${r.t}${(ST.rate && ST.rate[r.id]) ? " · " + "★".repeat(ST.rate[r.id]) : ""}`;
}

export function rebuildAll(){
  for (const k in catalog.all) if (k[0] === "X") delete catalog.all[k];
  (ST.cust || []).forEach(r => { catalog.all[r.id] = r; });
  catalog.ALL = Object.values(catalog.all).sort((a, b) => a.id[0] === b.id[0]
    ? parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10)
    : ORD.indexOf(a.id[0]) - ORD.indexOf(b.id[0]));
  clearLabels();
  catalog.ALL.forEach(r => labelsOf(r.id));
}

export function cleanIds(){
  let ch = false;
  ["sel","done","rate"].forEach(f => {
    const o = ST[f];
    if (o && typeof o === "object") Object.keys(o).forEach(k => { if (!catalog.all[k]) { delete o[k]; ch = true; } });
  });
  if (ST.week && typeof ST.week === "object") Object.keys(ST.week).forEach(d => {
    const w = ST.week[d] || {};
    Object.keys(w).forEach(s => { if (w[s] && !catalog.all[w[s]]) { delete w[s]; ch = true; } });
  });
  if (ch) persist();
}

let lock = null, nsv = null;
export async function keepAwake(){
  let ok = false;
  try {
    if (navigator.wakeLock) {
      lock = await navigator.wakeLock.request("screen");
      ok = true;
      lock.addEventListener("release", () => { lock = null; });
    }
  } catch (e) {}
  if (!ok) {
    try {
      if (!nsv) {
        nsv = document.createElement("video");
        nsv.setAttribute("playsinline", "");
        nsv.setAttribute("muted", "");
        nsv.muted = true;
        nsv.loop = true;
        nsv.src = NSVIDEO;
        nsv.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:.02;pointer-events:none";
        document.body.appendChild(nsv);
      }
      await nsv.play();
      ok = true;
    } catch (e) {}
  }
  ui.awake = ok;
  const w = $("#wk");
  if (w) { w.textContent = ok ? "Bildschirm bleibt an" : "Bildschirm kann ausgehen"; w.classList.toggle("on", ok); }
}
export function letSleep(){
  if (lock) { try { lock.release(); } catch (e) {} lock = null; }
  if (nsv) { try { nsv.pause(); } catch (e) {} }
  ui.awake = false;
}

function row(r){
  const n = ST.sel[r.id] || 0;
  return `<div class="rc"><button class="rb" data-open="${r.id}"><span class="top"><span class="id">${r.id}</span><b>${esc(r.n)}</b></span><span class="meta">${metaOf(r)}</span></button><button class="add" data-add="${r.id}" aria-pressed="${n > 0}" aria-label="${n > 0 ? "Aus Plan nehmen" : "Zum Plan hinzufügen"}">${n > 0 ? (n > 1 ? n + "×" : "✓") : "+"}</button></div>`;
}
export function listHtml(){
  const q = ui.fq.trim().toLowerCase();
  let rows;
  if (ui.fg === FAVG) {
    rows = catalog.ALL.filter(r => starsOf(r.id) > 0 && (!q || (r.n + " " + r.id).toLowerCase().includes(q)))
      .sort((a, b) => starsOf(b.id) - starsOf(a.id) || a.n.localeCompare(b.n, "de"));
    if (!rows.length) return '<p class="empty">Noch keine Favoriten. Öffne ein Rezept und gib ihm 1 bis 3 Sterne.</p>';
  } else {
    rows = catalog.ALL.filter(r => (ui.fg === "Alle" || grp(r) === ui.fg) && (!q || (r.n + " " + r.id).toLowerCase().includes(q)));
    if (!rows.length) return '<p class="empty">Kein Rezept gefunden.</p>';
  }
  return rows.map(row).join("");
}
export function recipesHtml(){
  return `<div class="tools"><input id="q" type="search" placeholder="Rezept suchen" value="${esc(ui.fq)}" aria-label="Rezept suchen"><div class="chips" id="chips">${GROUPS.map(g => `<button data-g="${g}" aria-pressed="${g === ui.fg}">${g}</button>`).join("")}</div></div><button class="btn" id="newrec" style="width:100%;margin-bottom:10px">Eigenes Rezept anlegen</button><div id="list">${listHtml()}</div>`;
}

export function detailHtml(id){
  const r = catalog.all[id];
  const rc = ST.rc[id] || { z:{}, s:{} };
  const f = r.ns ? 1 : 2 * (r.w || 1);
  const n = ST.sel[id] || 0;
  const s = starsOf(id);
  const stars = `<div class="stars" role="group" aria-label="Bewertung">${[1, 2, 3].map(k => `<button data-star="${k}" aria-pressed="${s >= k}" aria-label="${k} Stern${k > 1 ? "e" : ""}">${s >= k ? "★" : "☆"}</button>`).join("")}<span>${s ? s + " von 3 Sternen" : "Bewerten"}</span></div>`;
  let extra = `<div class="drow"><button class="btn" data-dyadd="${id}">Heute gegessen</button></div>`;
  if (r.cust) extra += `<div class="drow"><button class="btn" data-cred="${id}">Bearbeiten</button><button class="btn warn" data-crdel="${id}">Löschen</button></div>`;
  return `<div class="dtop"><div class="in"><button class="back" id="back">Zurück</button><span class="wk" id="wk">Bildschirm wird geprüft</span></div></div>
  <div class="dbody"><h2>${esc(r.n)}</h2>
   <div class="tags"><span class="tag">${r.id}</span><span class="tag">${r.k} kcal${r.u && /pro /.test(r.u) ? "" : " pro Person"}</span><span class="tag">${r.p} g Eiweiß${r.u && /pro /.test(r.u) ? "" : " pro Person"}</span><span class="tag">${esc(r.t)}</span></div>
   ${r.u ? `<div class="meta" style="margin-bottom:4px">${esc(r.u)}</div>` : ""}
   ${stars}
   <h3 class="sec">Zutaten (${r.ns ? esc(r.pt) : "für 2 Personen"})</h3>
   <div class="box">${r.z.map((x, i) => `<button class="ck" role="checkbox" aria-checked="${!!rc.z[i]}" data-rz="${i}" style="grid-template-columns:30px 1fr"><i>${ck}</i><span class="l">${esc(sc(x, f))}</span></button>`).join("")}</div>
   <h3 class="sec">Zubereitung</h3>
   <div class="box">${r.s.map((x, i) => `<button class="stp" role="checkbox" aria-checked="${!!rc.s[i]}" data-rs="${i}"><span class="n">${i + 1}</span><span class="t">${esc(x)}</span></button>`).join("")}</div>
   ${r.note ? `<div class="dn">${esc(r.note)}</div>` : ""}${r.q ? `<p class="note">Quelle: ${esc(r.q)}</p>` : ""}
   <div class="drow"><button class="btn${n ? "" : " pri"}" id="dadd">${n ? "Aus dem Plan nehmen" : "Zum Plan hinzufügen"}</button><button class="btn" id="drst">Haken zurücksetzen</button></div>
   ${extra}</div>`;
}
export function openRecipe(id){
  if (!catalog.all[id]) return;
  ui.openId = id;
  const d = $("#det");
  d.innerHTML = detailHtml(id);
  d.hidden = false;
  d.scrollTop = 0;
  keepAwake();
}
export function closeRecipe(){
  ui.openId = null;
  $("#det").hidden = true;
  letSleep();
  ui.render();
}
export function redrawDetail(){
  if (ui.openId && !catalog.all[ui.openId]) { closeRecipe(); return; }
  const d = $("#det"), y = d.scrollTop;
  d.innerHTML = detailHtml(ui.openId);
  d.scrollTop = y;
  const w = $("#wk");
  if (w) { w.textContent = ui.awake ? "Bildschirm bleibt an" : "Bildschirm kann ausgehen"; w.classList.toggle("on", ui.awake); }
}

function chipsHtml(){
  const fr = ST.fr, q = ui.fq2.trim().toLowerCase();
  const LCAT = labelMap();
  let out = "";
  ["Fleisch & Wurst","Milchprodukte & Eier","Gemüse & Obst","Trockenware, Brot & Sonstiges"].forEach(c => {
    const ls = Object.keys(LCAT).filter(l => LCAT[l] === c && (!q || l.toLowerCase().includes(q))).sort();
    if (ls.length) out += `<h3 class="sec">${c}</h3><div class="ing">${ls.map(l => `<button data-fi="${esc(l)}" aria-pressed="${!!fr[l]}">${esc(l)}</button>`).join("")}</div>`;
  });
  return out || '<p class="empty">Keine Zutat gefunden.</p>';
}
function resHtml(){
  const fr = ST.fr;
  if (!Object.keys(fr).length) return '<p class="empty">Wähle oben Zutaten aus, dann erscheinen hier passende Rezepte.</p>';
  const rows = catalog.ALL.map(r => {
    const L = labelsOf(r.id), h = L.filter(l => fr[l]), m = L.filter(l => !fr[l]);
    return { r, L, h, m };
  }).filter(x => x.L.length && x.h.length && x.m.length <= 3)
    .sort((a, b) => a.m.length - b.m.length || b.h.length - a.h.length).slice(0, 20);
  if (!rows.length) return '<p class="empty">Dazu passt noch nichts. Wähle mehr Zutaten aus.</p>';
  return rows.map(x => {
    const n = ST.sel[x.r.id] || 0;
    return `<div class="rc"><button class="rb" data-fo="${x.r.id}"><span class="top"><span class="id">${x.r.id}</span><b>${esc(x.r.n)}</b></span><span class="meta">${metaOf(x.r)}</span>${x.m.length ? `<span class="fmiss">fehlt: ${esc(x.m.join(", "))}</span>` : '<span class="fok">Alles da</span>'}</button><button class="add" data-fa="${x.r.id}" aria-pressed="${n > 0}" aria-label="${n > 0 ? "Aus Plan nehmen" : "Zum Plan hinzufügen"}">${n > 0 ? "✓" : "+"}</button></div>`;
  }).join("");
}
function fridgeHtml(){
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Schließen</button><span class="wk on" id="fcnt"></span></div></div>
  <div class="dbody"><h2>Kühlschrank</h2><p class="note" style="margin-top:0">Tippe an, was du da hast. Unten stehen Rezepte, die dazu passen.</p>
  <input id="fsr" class="finp" type="search" placeholder="Zutat suchen" value="${esc(ui.fq2)}" aria-label="Zutat suchen">
  <div id="fch">${chipsHtml()}</div>
  <h3 class="sec">Passt dazu</h3><div id="fres">${resHtml()}</div>
  <button class="btn" data-fclr style="width:100%;margin-top:10px">Auswahl leeren</button></div>`;
}
function fcount(){
  const n = Object.keys(ST.fr).length;
  const e = $("#fcnt");
  if (e) e.textContent = n ? n + " Zutaten gewählt" : "";
}
export function refreshFridge(){
  const ch = $("#fch"), res = $("#fres");
  if (ch) ch.innerHTML = chipsHtml();
  if (res) res.innerHTML = resHtml();
  fcount();
}
export function openFridge(){
  ui.pm = "F";
  showPanel(fridgeHtml());
  fcount();
}

function diceHtml(){
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Schließen</button></div></div>
  <div class="dbody"><h2>Was esse ich?</h2><p class="note" style="margin-top:0">Such dir eine Art aus und würfle.</p>
  <div class="chips" id="dchips">${DGROUPS.map(g => `<button data-dg="${g}" aria-pressed="${g === ui.dg}">${g}</button>`).join("")}<button data-dfr aria-pressed="${ui.dfr}">Nur aus dem Kühlschrank</button></div>
  <div id="dres"></div>
  <button class="bigroll" id="droll">Würfeln</button></div>`;
}
function dpool(){
  let p = catalog.ALL.filter(r => ui.dg === "Alle" || grp(r) === ui.dg);
  if (ui.dfr) {
    const fr = ST.fr;
    p = p.filter(r => {
      const L = labelsOf(r.id);
      return L.length && L.some(l => fr[l]) && L.filter(l => !fr[l]).length <= 2;
    });
  }
  const out = [];
  p.forEach(r => { out.push(r); for (let i = 0; i < starsOf(r.id); i++) out.push(r); });
  return out;
}
function dshow(r, fin){
  const n = ST.sel[r.id] || 0;
  $("#dres").innerHTML = `<div class="dice-card"><span class="id">${r.id}</span><b>${esc(r.n)}</b><span class="meta">${metaOf(r)}</span></div>` +
    (fin ? `<div class="dice-acts"><button class="btn pri" data-do="${r.id}">Rezept ansehen</button><button class="btn" data-da="${r.id}">${n ? "Im Plan ✓" : "Zum Plan"}</button></div>` : "");
}
function roll(){
  const p = dpool(), out = $("#dres");
  clearDiceTimer();
  if (!p.length) { out.innerHTML = '<p class="empty">Dazu gibt es nichts. Nimm eine andere Art oder wähle mehr Zutaten im Kühlschrank.</p>'; return; }
  const fin = p[Math.floor(Math.random() * p.length)];
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || p.length === 1) { dshow(fin, true); return; }
  let n = 0;
  setDiceTimer(setInterval(() => {
    n++;
    if (n >= 12) { clearDiceTimer(); dshow(fin, true); }
    else dshow(p[Math.floor(Math.random() * p.length)], false);
  }, 80));
}
export function openDice(){
  ui.pm = "D";
  showPanel(diceHtml());
}

export function crHtml(id){
  const r = id ? catalog.all[id] : null;
  const g = r ? grp(r) : "Hauptmahlzeit";
  const box = `<div class="box" style="padding:12px;margin:0 0 12px"><b>Aus Screenshot oder Text</b>
   <label class="btn pri" style="display:flex;align-items:center;justify-content:center;margin-top:8px;cursor:pointer">Screenshot auswählen<input id="cr-img" type="file" accept="image/*" multiple style="position:absolute;opacity:0;width:1px;height:1px"></label>
   <p class="note" id="crimpst" style="margin:8px 0 0">Die Texterkennung läuft auf deinem Handy. Beim ersten Mal wird sie einmalig geladen, dafür braucht es Internet.</p>
   <div id="cr-review" hidden></div>
   <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600;min-height:36px;display:flex;align-items:center">Oder Rezepttext einfügen</summary>
    <textarea id="cr-raw" style="width:100%;min-height:120px;margin-top:6px" placeholder="Beschreibung aus Instagram hier einfügen"></textarea>
    <button class="btn" data-crraw style="width:100%;margin-top:6px">Text übernehmen</button></details></div>`;
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Abbrechen</button></div></div>
  <div class="dbody"><h2>${r ? "Rezept bearbeiten" : "Eigenes Rezept"}</h2>
  <p class="note" style="margin-top:0">Zutaten und Mengen gelten für 2 Personen, genau so wie du sie eintippst. Kalorien und Eiweiß pro Person.</p>
  ${box}
  <div class="frm">
   <label class="full">Name<input id="cr-n" value="${esc(r ? r.n : "")}" placeholder="z. B. Hähnchen-Reis-Pfanne"></label>
   <label class="full">Art<select id="cr-g">${Object.keys(CGRP).map(x => `<option${x === g ? " selected" : ""}>${x}</option>`).join("")}</select></label>
   <label>kcal pro Person<input id="cr-k" inputmode="numeric" value="${r ? r.k : ""}" placeholder="automatisch"></label>
   <label>Eiweiß (g)<input id="cr-p" inputmode="numeric" value="${r ? r.p : ""}" placeholder="automatisch"></label>
   <label class="full">Zeit<input id="cr-t" value="${esc(r ? r.t : "")}" placeholder="automatisch"></label>
   <label class="full">Zutaten, eine pro Zeile<textarea id="cr-z" placeholder="400 g Hähnchenbrust&#10;200 g Reis (roh)&#10;1 Paprika&#10;Salz, Pfeffer">${esc(r ? r.z.join("\n") : "")}</textarea></label>
   <label class="full">Zubereitung, ein Schritt pro Zeile<textarea id="cr-s" placeholder="Reis kochen.&#10;Hähnchen würfeln und anbraten.">${esc(r ? r.s.join("\n") : "")}</textarea></label>
  </div>
  <div class="stack"><button class="btn" data-crcalc>Kalorien, Eiweiß und Zeit berechnen</button><p class="note" id="crhint" style="margin:0">Nur ungefähre Werte. Lässt du die Felder leer, rechnet die App beim Speichern selbst.</p><button class="btn pri" data-crsave="${id || ""}">Speichern</button></div></div>`;
}
export function openCr(id){
  ui.pm = "C";
  showPanel(crHtml(id || ""));
}
function crLines(id){
  return ($(id) || { value:"" }).value.split("\n").map(x => x.trim()).filter(Boolean);
}
function fillEstimate(force){
  const kE = $("#cr-k"), pE = $("#cr-p"), tE = $("#cr-t");
  if (!kE || !pE || !tE) return null;
  if (!force && kE.value.trim() && pE.value.trim() && tE.value.trim()) return null;
  const e = estimateRecipe(crLines("#cr-z"), crLines("#cr-s"));
  if (!kE.value.trim()) kE.value = e.k;
  if (!pE.value.trim()) pE.value = e.p;
  if (!tE.value.trim()) tE.value = e.t;
  return e;
}
export function saveCr(id){
  const kE = $("#cr-k"), pE = $("#cr-p"), tE = $("#cr-t");
  if (kE && pE && tE && (!kE.value.trim() || !pE.value.trim() || !tE.value.trim())) fillEstimate(false);
  const n = $("#cr-n").value.trim();
  if (!n) { toast("Bitte einen Namen eintragen"); return; }
  const z = crLines("#cr-z"), s = crLines("#cr-s");
  if (!z.length) { toast("Bitte Zutaten eintragen"); return; }
  const num = v => Math.max(0, Math.round(parseFloat(String(v).replace(",", ".")) || 0));
  const rec = {
    id: id || ("X" + Date.now()), n,
    c: CGRP[$("#cr-g").value] || "Hauptmahlzeit (16 Uhr)",
    k: num($("#cr-k").value), p: num($("#cr-p").value),
    t: $("#cr-t").value.trim() || "–",
    z, s: s.length ? s : ["Nach Belieben zubereiten."],
    ns: true, pt: "für 2 Personen", cust: 1,
  };
  const i = ST.cust.findIndex(c => c.id === rec.id);
  if (i >= 0) ST.cust[i] = rec; else ST.cust.push(rec);
  rebuildAll();
  persist();
  closePanel();
  if (ui.openId) redrawDetail();
  toast("Rezept gespeichert");
}
function setField(id, v){
  const e = $(id);
  if (e && v !== undefined && v !== "") e.value = v;
}
export function applyParsed(r){
  setField("#cr-n", r.n);
  if (r.z.length) setField("#cr-z", r.z.join("\n"));
  if (r.s.length) setField("#cr-s", r.s.join("\n"));
  setField("#cr-t", r.t);
  setField("#cr-k", r.k);
  setField("#cr-p", r.p);
  const nz = r.z.length, ns = r.s.length;
  let note = "Übernommen: " + nz + (nz === 1 ? " Zutat" : " Zutaten") + ", " + ns + (ns === 1 ? " Schritt" : " Schritte");
  if (r.k || r.p) note += ", Nährwerte aus dem Text (" + (r.k ? r.k + " kcal" : "") + (r.k && r.p ? ", " : "") + (r.p ? r.p + " g Eiweiß" : "") + ")";
  note += ".";
  if (r.portions && r.portions !== 2) note += " Im Text stehen " + r.portions + " Portionen, die Mengen wurden auf 2 Personen umgerechnet.";
  if (!r.z.length) note += " Zutaten wurden nicht erkannt, bitte unten eintragen.";
  if (r.dropped && r.dropped.length) note += " " + r.dropped.length + " unklare Zeile" + (r.dropped.length > 1 ? "n wurden" : " wurde") + " weggelassen.";
  note += " Bitte alles kurz prüfen.";
  if (r.z.length && (!r.k || !r.p || !r.t)) {
    try {
      const e = estimateRecipe(r.z, r.s);
      if (!r.k) setField("#cr-k", e.k);
      if (!r.p) setField("#cr-p", e.p);
      if (!r.t) setField("#cr-t", e.t);
      note += " Fehlende kcal, Eiweiß und Zeit sind ungefähr aus den Zutaten berechnet.";
    } catch (e) {}
  }
  const h = $("#crimpst");
  if (h) h.textContent = note;
}

let reviewLines = null;
export function showOcrReview(parsed, extraDropped){
  const dropped = (parsed.dropped || []).concat(extraDropped || []);
  reviewLines = parsed;
  const box = $("#cr-review");
  if (!box) { applyParsed(parsed); return; }
  const line = (kind, text, on) => `<label class="revline"><input type="checkbox" data-rev="${kind}" ${on ? "checked" : ""}><input type="text" value="${esc(text)}"></label>`;
  box.hidden = false;
  box.innerHTML = `<p class="note" style="margin:8px 0">Prüfe die erkannten Zeilen. Nimm den Haken weg, wenn etwas nicht ins Rezept gehört. Den Text kannst du noch ändern.</p>
    <label class="full" style="display:block;font-size:13px;color:var(--muted);font-weight:600">Name<input id="cr-rev-n" value="${esc(parsed.n || "")}" style="width:100%;min-height:44px;margin-top:4px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:500 16px inherit;padding:8px 10px"></label>
    <h3 class="sec">Erkannte Zutaten</h3>
    <div id="cr-rev-z">${parsed.z.length ? parsed.z.map(t => line("z", t, true)).join("") : '<p class="empty">Keine Zutat erkannt.</p>'}</div>
    <h3 class="sec">Erkannte Schritte</h3>
    <div id="cr-rev-s">${parsed.s.length ? parsed.s.map(t => line("s", t, true)).join("") : '<p class="empty">Keine Schritte erkannt.</p>'}</div>
    ${dropped.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Weggelassen (${dropped.length})</summary><div id="cr-rev-d">${dropped.map(t => line("d", t, false)).join("")}</div></details>` : ""}
    <button class="btn pri" data-crrev style="width:100%;margin-top:10px">In das Formular übernehmen</button>`;
  const st = $("#crimpst");
  if (st) st.textContent = "Text erkannt. Hake unten an, was ins Rezept soll.";
}
function checkedLines(root){
  if (!root) return [];
  return [...root.querySelectorAll(".revline")].filter(l => l.querySelector("[type=checkbox]").checked).map(l => l.querySelector("[type=text]").value.trim()).filter(Boolean);
}
export function applyReview(){
  const name = ($("#cr-rev-n") || {}).value || "";
  const z = checkedLines($("#cr-rev-z"));
  const s = checkedLines($("#cr-rev-s"));
  const extra = checkedLines($("#cr-rev-d"));
  extra.forEach(l => { if (/^(\d|½|¼|¾|ein |eine )/i.test(l)) z.push(l); else s.push(l); });
  const base = reviewLines || {};
  applyParsed({ n:name.trim(), z, s, t:base.t || "", k:base.k || "", p:base.p || "", portions:base.portions || 0, dropped:[] });
  const box = $("#cr-review");
  if (box) box.hidden = true;
}

export function bindRecipeDom(){
  const pnl = $("#pnl");
  pnl.addEventListener("input", ev => {
    if (ev.target.id === "fsr") { ui.fq2 = ev.target.value; refreshFridge(); }
  });
  pnl.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.pc !== undefined) { closePanel(); return; }
    if (ui.pm !== "F" && ui.pm !== "D") return;
    if (d.fi !== undefined) {
      if (ST.fr[d.fi]) delete ST.fr[d.fi]; else ST.fr[d.fi] = 1;
      persist();
      const y = pnl.scrollTop;
      refreshFridge();
      pnl.scrollTop = y;
      return;
    }
    if (d.fclr !== undefined) { ST.fr = {}; persist(); refreshFridge(); return; }
    if (d.fo) { closePanel(); openRecipe(d.fo); return; }
    if (d.fa) {
      if (ST.sel[d.fa]) delete ST.sel[d.fa]; else ST.sel[d.fa] = 1;
      persist();
      const y = pnl.scrollTop;
      const fres = $("#fres");
      if (fres) fres.innerHTML = resHtml();
      pnl.scrollTop = y;
      toast(ST.sel[d.fa] ? "Zum Plan hinzugefügt" : "Aus dem Plan genommen");
      return;
    }
    if (d.dg) { ui.dg = d.dg; document.querySelectorAll("#dchips [data-dg]").forEach(b => b.setAttribute("aria-pressed", b.dataset.dg === ui.dg)); return; }
    if (d.dfr !== undefined) { ui.dfr = !ui.dfr; t.setAttribute("aria-pressed", ui.dfr); return; }
    if (t.id === "droll") { roll(); return; }
    if (d.do) { closePanel(); openRecipe(d.do); return; }
    if (d.da) {
      if (ST.sel[d.da]) delete ST.sel[d.da]; else ST.sel[d.da] = 1;
      persist();
      t.textContent = ST.sel[d.da] ? "Im Plan ✓" : "Zum Plan";
      toast(ST.sel[d.da] ? "Zum Plan hinzugefügt" : "Aus dem Plan genommen");
    }
  });
  $("#det").addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t || !ui.openId) return;
    const d = t.dataset;
    if (t.id === "back") { closeRecipe(); return; }
    const rc = ST.rc[ui.openId] || (ST.rc[ui.openId] = { z:{}, s:{} });
    if (d.rz !== undefined) { if (rc.z[d.rz]) delete rc.z[d.rz]; else rc.z[d.rz] = 1; persist(); redrawDetail(); return; }
    if (d.rs !== undefined) { if (rc.s[d.rs]) delete rc.s[d.rs]; else rc.s[d.rs] = 1; persist(); redrawDetail(); return; }
    if (t.id === "drst") { delete ST.rc[ui.openId]; persist(); redrawDetail(); toast("Haken zurückgesetzt"); return; }
    if (t.id === "dadd") {
      if (ST.sel[ui.openId]) { delete ST.sel[ui.openId]; toast("Aus dem Plan genommen"); }
      else { ST.sel[ui.openId] = 1; toast("Zum Plan hinzugefügt"); }
      persist();
      redrawDetail();
    }
  });
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (t.id === "newrec") { openCr(""); return; }
    if (d.crsave !== undefined) { saveCr(d.crsave); return; }
    if (d.cred) { openCr(d.cred); return; }
    if (d.crdel) {
      if (t.dataset.c) {
        ST.cust = ST.cust.filter(c => c.id !== d.crdel);
        delete ST.sel[d.crdel];
        delete ST.rc[d.crdel];
        rebuildAll();
        persist();
        closeRecipe();
        toast("Rezept gelöscht");
      } else {
        t.dataset.c = 1;
        t.textContent = "Wirklich löschen?";
        setTimeout(() => { if (t.isConnected) { delete t.dataset.c; t.textContent = "Löschen"; } }, 3500);
      }
      return;
    }
    if (d.crcalc !== undefined) {
      const z = crLines("#cr-z");
      if (!z.length) { toast("Trag zuerst die Zutaten ein"); return; }
      const e = estimateRecipe(z, crLines("#cr-s"));
      $("#cr-k").value = e.k; $("#cr-p").value = e.p; $("#cr-t").value = e.t;
      const h = $("#crhint");
      if (h) h.textContent = "Ungefähr " + e.k + " kcal und " + e.p + " g Eiweiß pro Person." + (e.unknown.length ? " Nicht erkannt, deshalb nicht mitgerechnet: " + e.unknown.join(", ") + ". Du kannst die Werte jederzeit selbst ändern." : " Du kannst die Werte jederzeit selbst ändern.");
      return;
    }
    if (d.crraw !== undefined) {
      const raw = $("#cr-raw");
      if (!raw || !raw.value.trim()) { toast("Bitte erst Text einfügen"); return; }
      const parsed = parseRecipeText(raw.value);
      if (parsed.dropped.length) showOcrReview(parsed);
      else applyParsed(parsed);
      return;
    }
    if (d.crrev !== undefined) { applyReview(); return; }
    if (d.star !== undefined && ui.openId) {
      const n = parseInt(d.star, 10), cur = starsOf(ui.openId);
      if (!ST.rate || typeof ST.rate !== "object") ST.rate = {};
      if (cur === n) delete ST.rate[ui.openId]; else ST.rate[ui.openId] = n;
      persist();
      redrawDetail();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (ui.openId && document.visibilityState === "visible") keepAwake();
  });
}
