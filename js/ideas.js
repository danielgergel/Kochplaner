/* "Neue Rezepte für mich": Profil aus Tagebuch und Einkauf, KI schlägt neue Rezepte vor. */
import { catalog, ST, DY, ui, persist, storage } from "./state.js";
import { $, esc, toast, dkey } from "./util.js";
import { showPanel, closePanel } from "./panels.js";
import { rebuildAll, CGRP } from "./recipes.js";
import { shopList, CATS } from "./shopcalc.js";
import { badges, nSel } from "./shopping.js";
import { seedHabits, topHabits } from "./habits.js";
import { AI_BASE, aiOnline, deviceGuess } from "./ai-recipe.js";
import { buildProfile, profileUsable, ideasFromAi, shopLines, buyKey } from "./ideas-ai.js";
import { loadBuys } from "./buys.js";

const IDK = "kochplaner.ideas.v1";
let busy = false;
let wish = "";
let last = null;

function readLast(){
  if (last) return last;
  try {
    const o = JSON.parse(storage.getItem(IDK));
    if (o && Array.isArray(o.list)) last = o;
  } catch (e) {}
  return last;
}
function saveLast(){
  try { if (last) storage.setItem(IDK, JSON.stringify(last)); } catch (e) {}
}

function currentShopping(){
  const out = [];
  for (const x of Array.isArray(ST.extra) ? ST.extra : []) if (x && x.t && !x.d) out.push(x.t);
  if (nSel()) {
    try {
      const L = shopList(ST.sel);
      CATS.forEach(c => (L.out[c] || []).forEach(x => { if (x && x.l && !(ST.sc && ST.sc[x.key])) out.push(x.l); }));
    } catch (e) {}
  }
  return out;
}

export function profileNow(){
  const habits = DY.habits && Object.keys(DY.habits).length ? DY.habits : seedHabits(DY.days || {}, {});
  const liked = [];
  for (const id of Object.keys(ST.rate || {})) if (catalog.all[id]) liked.push(catalog.all[id].n);
  for (const id of Object.keys(ST.sel || {})) if (catalog.all[id] && !liked.includes(catalog.all[id].n)) liked.push(catalog.all[id].n);
  return buildProfile({
    frequent: topHabits(habits, 25, 1),
    days: DY.days || {},
    today: dkey(new Date()),
    goal: DY.goal,
    shopping: currentShopping(),
    buys: loadBuys().m,
    recipes: (catalog.ALL || []).map(r => r.n),
    liked,
    wish,
  });
}

function summaryHtml(p){
  const bits = [];
  if (p.oft.length) bits.push(`<b>Isst du oft:</b> ${esc(p.oft.slice(0, 6).map(x => x.replace(/\s*\(\d+×\)$/, "")).join(", "))}`);
  const buys = p.einkauf.length ? p.einkauf : p.gekauft.map(x => x.replace(/\s*\(\d+×\)$/, ""));
  if (buys.length) bits.push(`<b>${p.einkauf.length ? "Auf deiner Einkaufsliste" : "Kaufst du oft"}:</b> ${esc(buys.slice(0, 6).join(", "))}`);
  if (p.schnitt) bits.push(`<b>Schnitt:</b> ${p.schnitt.kcal} kcal, ${p.schnitt.eiweiss} g Eiweiß pro Tag (Ziel ${p.ziel.kcal} kcal, ${p.ziel.eiweiss} g)`);
  if (!bits.length) return `<p class="note" style="margin:0 0 8px">Noch wenig Daten. Trag ein paar Mahlzeiten ins Tagebuch ein oder schreib unten, worauf du Lust hast.</p>`;
  return `<div class="idsum">${bits.map(b => `<p>${b}</p>`).join("")}</div>`;
}

function cardHtml(x, i){
  const meta = [x.kcal + " kcal", x.eiweiss + " g Eiweiß", x.zeit, x.airfryer ? "Airfryer" : ""].filter(Boolean).join(" · ");
  const saved = x.saved && catalog.all[x.saved];
  return `<div class="box idea">
    <b class="idn">${esc(x.name)}</b>
    <span class="meta">${esc(meta)} · pro Person</span>
    ${x.warum ? `<p class="idw">${esc(x.warum)}</p>` : ""}
    <details><summary>Zutaten für 2 und Zubereitung</summary>
      <ul class="idz">${x.z.map(z => `<li>${esc(z)}</li>`).join("")}</ul>
      <ol class="ids">${x.s.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    </details>
    <div class="drow" style="margin-top:10px">
      ${saved ? `<button class="btn" data-idopen="${esc(x.saved)}">In deinen Rezepten ✓</button>` : `<button class="btn" data-idsave="${i}">In meine Rezepte</button>`}
      <button class="btn" data-idshop="${i}"${x.shopped ? ' aria-pressed="true"' : ""}>${x.shopped ? "Auf der Liste ✓" : "Auf die Einkaufsliste"}</button>
    </div>
  </div>`;
}

function resultsHtml(msg){
  const l = readLast();
  let html = msg ? `<p class="note idmsg">${esc(msg)}</p>` : "";
  if (l && l.list.length) {
    const d = new Date(l.at || Date.now());
    const when = dkey(d) === dkey(new Date()) ? "heute" : "vom " + String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + ".";
    html += `<h3 class="sec">Vorschläge ${when}</h3>` + l.list.map(cardHtml).join("");
  }
  return html;
}

function panelHtml(){
  const p = profileNow();
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Zurück</button></div></div>
  <div class="dbody"><h2>Neue Rezepte für mich</h2>
  <p class="note" style="margin-top:0">Die KI schaut, was du oft isst, was auf deiner Einkaufsliste steht und was du oft kaufst. Dann schlägt sie dir neue Rezepte vor, die du noch nicht hast. Je mehr du einträgst, desto besser passen sie.</p>
  <div class="box" style="padding:12px">
    ${summaryHtml(p)}
    <input id="idwish" value="${esc(wish)}" placeholder="Worauf hast du Lust? (optional, z. B. was mit Reis)" maxlength="80" autocomplete="off" style="width:100%;min-height:46px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:500 16px inherit;padding:0 12px;margin-top:4px">
    <button class="btn pri" id="idgo" style="width:100%;margin-top:8px"${busy ? " disabled" : ""}>${busy ? "KI denkt nach …" : (readLast() ? "Neue Vorschläge holen" : "Vorschläge holen")}</button>
  </div>
  <div id="idres">${resultsHtml(aiOnline() ? "" : "Ohne Internet gibt es keine neuen Vorschläge. Deine letzten Vorschläge bleiben hier.")}</div>
  </div>`;
}

export function openIdeas(){
  ui.pm = "I";
  showPanel(panelHtml());
}
function redraw(msg){
  if (ui.pm !== "I") return;
  const res = $("#idres");
  if (res) res.innerHTML = resultsHtml(msg);
  const go = $("#idgo");
  if (go) { go.disabled = busy; go.textContent = busy ? "KI denkt nach …" : "Neue Vorschläge holen"; }
}

async function fetchIdeas(){
  if (busy) return;
  const w = $("#idwish");
  wish = w ? w.value.trim().slice(0, 80) : "";
  if (!aiOnline()) { redraw("Ohne Internet gibt es keine neuen Vorschläge. Versuch es wieder, wenn du online bist."); return; }
  const prof = profileNow();
  if (!profileUsable(prof)) { redraw("Noch zu wenig Daten. Trag ein paar Mahlzeiten ins Tagebuch ein oder schreib oben, worauf du Lust hast."); return; }
  busy = true;
  redraw("Die KI sucht passende Rezepte. Das dauert etwa 10 bis 20 Sekunden.");
  let msg = "";
  try {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 45000) : null;
    const res = await fetch(AI_BASE + "/rezeptideen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profil: prof }),
      signal: ctl ? ctl.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    if (res.status === 429) msg = "Gerade zu viele Anfragen. Probier es in ein paar Minuten nochmal.";
    else if (!res.ok) msg = "Die KI hatte gerade keine guten Vorschläge. Probier es gleich nochmal.";
    else {
      const list = ideasFromAi(await res.json(), prof.rezepte);
      if (!list) msg = "Die KI hatte gerade keine guten Vorschläge. Probier es gleich nochmal.";
      else { last = { at: Date.now(), list }; saveLast(); }
    }
  } catch (e) {
    msg = aiOnline() ? "Die KI ist gerade nicht erreichbar. Probier es gleich nochmal." : "Ohne Internet gibt es keine neuen Vorschläge.";
  }
  busy = false;
  redraw(msg);
  if (!msg) toast("Neue Rezeptideen sind da");
}

function saveIdea(i){
  const l = readLast();
  const x = l && l.list[i];
  if (!x) return;
  if (x.saved && catalog.all[x.saved]) { toast("Ist schon in deinen Rezepten"); return; }
  if (!Array.isArray(ST.cust)) ST.cust = [];
  const id = "X" + Date.now();
  const dev = x.airfryer ? "Airfryer" : deviceGuess(x.name, x.z);
  const rec = {
    id, n: x.name.slice(0, 120),
    c: CGRP[x.art] || "Hauptmahlzeit (16 Uhr)",
    k: x.kcal, p: x.eiweiss,
    t: x.zeit || "–",
    z: x.z.slice(), s: x.s.slice(),
    ns: true, pt: "für 2 Personen", cust: 1,
    note: ("Rezeptidee von der KI" + (dev ? " (" + dev + ")" : "") + "." + (x.warum ? " " + x.warum : "")).slice(0, 600),
  };
  ST.cust.push(rec);
  x.saved = id;
  saveLast();
  rebuildAll();
  persist();
  redraw("");
  toast("In deinen Rezepten gespeichert", { label: "Öffnen", run(){ closePanel(); if (ui.openRecipe) ui.openRecipe(id); } });
}

function shopIdea(i){
  const l = readLast();
  const x = l && l.list[i];
  if (!x) return;
  if (!Array.isArray(ST.extra)) ST.extra = [];
  const have = new Set(ST.extra.filter(e => e && !e.d).map(e => buyKey(e.t)));
  let n = 0;
  for (const t of shopLines(x.z)) {
    const k = buyKey(t);
    if (!k || have.has(k)) continue;
    have.add(k);
    ST.extra.push({ t: t.slice(0, 60), d: false });
    n++;
  }
  while (ST.extra.length > 100) ST.extra.shift();
  x.shopped = true;
  saveLast();
  if (n) persist();
  badges();
  redraw("");
  toast(n ? (n === 1 ? "1 Zutat auf die Einkaufsliste gesetzt" : n + " Zutaten auf die Einkaufsliste gesetzt") : "Steht schon alles auf der Liste");
}

export function bindIdeas(){
  document.addEventListener("click", ev => {
    const t = ev.target.closest && ev.target.closest("button");
    if (t && t.id === "ideas") openIdeas();
  });
  const pnl = $("#pnl");
  pnl.addEventListener("click", ev => {
    if (ui.pm !== "I") return;
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (t.id === "idgo") { fetchIdeas(); return; }
    if (d.idsave !== undefined) { saveIdea(+d.idsave); return; }
    if (d.idshop !== undefined) { shopIdea(+d.idshop); return; }
    if (d.idopen) { closePanel(); if (ui.openRecipe) ui.openRecipe(d.idopen); }
  });
  pnl.addEventListener("input", ev => { if (ev.target.id === "idwish") wish = ev.target.value; });
  pnl.addEventListener("keydown", ev => {
    if (ui.pm === "I" && ev.key === "Enter" && ev.target && ev.target.id === "idwish") { ev.preventDefault(); fetchIdeas(); }
  });
}
