/* Mahlzeit kombinieren: Oberfläche im Tagebuch (Vorschau, Mengen, Datum, Eintragen, eigene Mahlzeiten). */
import { DY, ui, dsave } from "./state.js";
import { $, esc, toast, f1, dkey, dlabel } from "./util.js";
import * as ML from "./meal.js";
import { aiOnline, fetchMeal } from "./ai-recipe.js";

let H = { add(){}, redraw(){} };
const S = { text:"", name:"", nameSet:false, day:"", editId:null, ov:{}, man:{}, extra:[], typing:false, view:null, ai:null };

const meals = () => (Array.isArray(DY.meals) ? DY.meals : (DY.meals = []));
const kc = x => Math.round(x);

function resetState(){
  S.text = ""; S.name = ""; S.nameSet = false; S.editId = null; S.ov = {}; S.man = {}; S.extra = []; S.typing = false; S.view = null; S.ai = null;
}

/* ---------- Block im Tagebuch ---------- */
export function mealBlockHtml(){
  const ms = meals();
  const list = ms.length
    ? `<details class="fold" data-k="Meine Mahlzeiten"${ui.foldOpen["Meine Mahlzeiten"] === false ? "" : " open"}><summary>Meine Mahlzeiten (${ms.length})</summary><div class="box">` +
      ms.map((m, i) => {
        const t = ML.sumItems(m.items);
        return `<div class="ent"><b>${esc(m.n)}</b><span class="meta">${kc(t.k)} kcal · ${f1(t.p)} g Eiweiß · ${m.items.length} Zutaten</span><div class="eac"><button data-mlfe="${i}" aria-label="Eintragen: ${esc(m.n)}" style="width:auto;padding:0 12px">Eintragen</button><button data-mled="${i}" aria-label="Bearbeiten">✎</button><button data-mlfx="${i}" aria-label="Löschen">×</button></div></div>`;
      }).join("") + `</div></details>`
    : "";
  return `<button class="btn pri mlopen" data-mlopen>Mahlzeit kombinieren</button>${list}`;
}

/* ---------- Sheet ---------- */
function sheet(){
  let e = $("#mlp");
  if (!e) {
    e = document.createElement("div");
    e.id = "mlp";
    e.hidden = true;
    document.body.appendChild(e);
    let sx = 0, sy = 0, st = 0;
    e.addEventListener("touchstart", ev => { const t = ev.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); ev.stopPropagation(); }, { passive:true });
    e.addEventListener("touchend", ev => {
      ev.stopPropagation();
      const t = ev.changedTouches[0];
      if (sx <= 36 && t.clientX - sx > 70 && Math.abs(t.clientY - sy) < 70 && Date.now() - st < 900) closeMeal();
    }, { passive:true });
  }
  return e;
}

function dayChips(){
  const t = dkey(new Date()), y = new Date();
  y.setDate(y.getDate() - 1);
  const yk = dkey(y);
  const other = S.day !== t && S.day !== yk;
  return `<div class="mlday"><span>Für:</span><button class="chipb" data-mlday="${t}" aria-pressed="${S.day === t}">Heute</button><button class="chipb" data-mlday="${yk}" aria-pressed="${S.day === yk}">Gestern</button><label class="chipb mldate" aria-pressed="${other}">${other ? esc(dlabel(S.day)) : "Datum"}<input type="date" id="ml-d" value="${esc(S.day)}" max="${t}" aria-label="Datum wählen"></label></div>`;
}

function favChips(){
  const ms = meals();
  if (!ms.length || S.editId) return "";
  return `<div class="mlfav"><span class="meta">Mit einem Tipp eintragen:</span><div class="alts">` + ms.map((m, i) => `<button class="chipb" data-mlfq="${i}">${esc(m.n)}</button>`).join("") + `</div></div>`;
}

function draw(){
  const e = sheet();
  e.innerHTML = `<div class="dtop"><div class="in"><button class="back" data-mlclose>Schließen</button><span class="wk">Alle Werte grob geschätzt</span></div></div>
  <div class="dbody"><h2>${S.editId ? "Mahlzeit bearbeiten" : "Mahlzeit kombinieren"}</h2>
  <div id="ml-fav">${favChips()}</div>
  <div id="ml-day">${dayChips()}</div>
  <label class="mllab" for="ml-t">Was hast du gegessen?</label>
  <span class="clr"><input id="ml-t" class="finp" placeholder="z. B. 1 Scheibe Brot mit Hähnchenaufschnitt" autocomplete="off" autocapitalize="none" enterkeyhint="done" value="${esc(S.text)}"><button type="button" class="xbtn" aria-label="Eingabe löschen">×</button></span>
  <div class="mlbtns"><button class="btn" data-mlbc>Barcode</button>${aiOnline() ? `<button class="btn" data-mlai id="ml-ai">Mit KI schätzen</button>` : ""}</div>
  <div id="ml-pv"></div>
  <label class="mllab" for="ml-s">Zutat einzeln suchen</label>
  <span class="clr"><input id="ml-s" class="finp" type="search" placeholder="z. B. Gurke, Skyr, Honig" autocomplete="off" enterkeyhint="search"><button type="button" class="xbtn" aria-label="Eingabe löschen">×</button></span>
  <div id="ml-sr"></div>
  <label class="mllab" for="ml-n">Name der Mahlzeit</label>
  <input id="ml-n" class="finp" placeholder="z. B. Mein Frühstück" autocomplete="off" value="${esc(S.name)}">
  </div>
  <div class="mlbar" id="ml-bar"></div>`;
  paint();
}

function build(){
  ML.setCustomFoods(DY.foods);
  const parsed = ML.parseMeal(S.text);
  const rows = [], unk = [];
  parsed.items.forEach(it => {
    const ov = S.ov[it.key];
    if (ov && ov.rm) return;
    let cur = it;
    if (ov && ov.fi != null && it.alts[ov.fi]) { cur = ML.rebase(it, it.alts[ov.fi]); cur.alts = it.alts; cur.ai = ov.fi; cur.key = it.key; }
    if (ov && ov.c != null) { cur.c = ov.c; cur.ul = ov.ul; cur.ug = ov.ug; }
    rows.push({ it:cur, ref:{ t:it.key }, typing:S.typing && it.last });
  });
  parsed.unknown.forEach(u => {
    const man = S.man[u.key];
    if (man && man.rm) return;
    if (man && man.k != null) {
      const it = ML.manualItem(u.raw, man.k, man.p);
      if (man.c) it.c = man.c;
      rows.push({ it, ref:{ t:u.key, man:1 }, manual:true });
    } else if (!(S.typing && u.last)) unk.push(u);
  });
  S.extra.forEach((it, i) => rows.push({ it, ref:{ x:i }, manual:!!it.por }));
  return { rows, unk };
}

function rowHtml(r, i){
  const it = r.it;
  const sh = ML.itemGrams(it);
  const food = it.lb && it.lb.toLowerCase() !== ML.shortName(it.n).toLowerCase() ? `<span class="mlf">→ ${esc(it.n)}</span>` : "";
  const grob = it.gr ? `<span class="mlg">grob</span>` : "";
  const title = esc(it.lb || ML.shortName(it.n));
  const unitBtn = it.por ? `<span class="mlu">Portion${it.c === 1 ? "" : "en"}</span>` : (it.ul === "g" || it.ul === "ml")
    ? (it.nu ? `<button class="mlu" data-mlu="${i}" aria-label="In ${esc(it.nu)} umschalten">${esc(it.ul)}</button>` : `<span class="mlu">${esc(it.ul)}</span>`)
    : `<button class="mlu" data-mlu="${i}" aria-label="In Gramm umschalten">${esc(ML.unitText(it))}</button>`;
  const meta = it.por ? `${kc(ML.itemKcal(it))} kcal · ${f1(ML.itemProt(it))} g Eiweiß` : `${kc(sh)} g · ${kc(ML.itemKcal(it))} kcal · ${f1(ML.itemProt(it))} g Eiweiß`;
  const alts = it.alts && it.alts.length > 1 ? `<div class="alts">Meintest du: ` + it.alts.map((f, j) => j === (it.ai || 0) ? "" : `<button class="chipb" data-mlalt="${i}:${j}">${esc(ML.shortName(f.n))}</button>`).join("") + `</div>` : "";
  return `<div class="mlr"><div class="mlh"><b>${title}</b>${food}${grob}<button class="mlx" data-mlrm="${i}" aria-label="${title} entfernen">×</button></div>
  <div class="mlq"><button data-mls="${i}:-1" aria-label="Weniger">−</button><input class="qin" data-mlin="${i}" inputmode="decimal" value="${esc(String(ML.amountLabel(it).split(" ")[0]))}" aria-label="Menge ${title}"><span class="mlun">${unitBtn}</span><button data-mls="${i}:1" aria-label="Mehr">+</button></div>
  <span class="meta">${meta}</span>${alts}</div>`;
}

function unkHtml(u, i){
  return `<div class="mlr mlu0"><div class="mlh"><b>Nicht erkannt: ${esc(u.raw)}</b><button class="mlx" data-mlurm="${i}" aria-label="Ignorieren">×</button></div>
  <div class="mlm"><label>kcal pro Portion<input inputmode="numeric" id="ml-uk${i}" placeholder="z. B. 150"></label><label>Eiweiß (g)<input inputmode="decimal" id="ml-up${i}" placeholder="z. B. 5"></label>
  <button class="btn" data-mluadd="${i}">Übernehmen</button></div></div>`;
}

function paint(){
  const pv = $("#ml-pv"), bar = $("#ml-bar");
  if (!pv || !bar) return;
  const v = S.view = build();
  const items = v.rows.map(r => r.it);
  pv.innerHTML = (v.rows.length ? `<div class="mlbox">${v.rows.map(rowHtml).join("")}</div>` : (S.text.trim() ? "" : `<p class="empty" style="padding:8px 2px">Tippe, was du gegessen hast. Mehrere Dinge trennst du mit „mit“, „und“, „+“ oder Komma.</p>`)) +
    (v.unk.length ? v.unk.map(unkHtml).join("") : "") + (S.ai ? `<p class="note">${esc(S.ai)}</p>` : "");
  const t = ML.sumItems(items);
  const auto = ML.mealName(items);
  const ni = $("#ml-n");
  if (!S.nameSet && ni && document.activeElement !== ni) ni.value = auto;
  const nm = (S.nameSet ? S.name : auto) || "";
  v.name = nm;
  v.sum = t;
  const day = dlabel(S.day);
  const canGo = items.length > 0;
  bar.innerHTML = `<div class="mlsum"><b>ca. ${kc(t.k)} kcal</b><span>ca. ${f1(t.p)} g Eiweiß</span></div>
  <p class="note" style="margin:2px 0 6px">Ungefähr: grobe Durchschnittswerte, keine Messung.</p>
  <div class="mlact">${S.editId
    ? `<button class="btn" data-mlgo ${canGo ? "" : "disabled"}>Eintragen · ${esc(day)}</button><button class="btn pri" data-mlsave ${canGo ? "" : "disabled"}>Änderungen speichern</button>`
    : `<button class="btn" data-mlsave ${canGo ? "" : "disabled"}>Merken</button><button class="btn pri" data-mlgo ${canGo ? "" : "disabled"}>Eintragen · ${esc(day)}</button>`}</div>`;
}

function paintSearch(q){
  ML.setCustomFoods(DY.foods);
  const out = $("#ml-sr");
  if (!out) return;
  const fs = q.trim().length >= 2 ? ML.matchFoods(q, 6) : [];
  out.innerHTML = fs.length ? `<div class="box">` + fs.map((f, i) => `<button class="ck" data-mlsa="${i}" style="grid-template-columns:1fr auto"><span class="l">${esc(ML.shortName(f.n))}<small>${f.k} kcal · ${f1(f.p)} g Eiweiß pro 100 g${f.gr ? " · grob" : ""}</small></span><span class="q">+ hinzu</span></button>`).join("") + `</div>` : (q.trim().length >= 2 ? '<p class="empty" style="padding:6px 2px">Nichts gefunden.</p>' : "");
  out._f = fs;
}

/* ---------- Öffnen, Schließen ---------- */
export function openMeal(opts){
  resetState();
  S.day = (opts && opts.day) || ui.dyk || dkey(new Date());
  if (opts && opts.edit != null) {
    const m = meals()[opts.edit];
    if (m) {
      S.editId = m.id; S.name = m.n; S.nameSet = true;
      S.extra = m.items.map(it => Object.assign({}, it));
    }
  }
  const e = sheet();
  draw();
  e.hidden = false;
  e.scrollTop = 0;
}
export function closeMeal(){
  const e = $("#mlp");
  if (e) e.hidden = true;
  resetState();
}

function finish(day){
  const diaryOpen = ui.pm === "Y" && !$("#pnl").hidden;
  if (day && diaryOpen) ui.dyk = day;
  closeMeal();
  if (diaryOpen) H.redraw();
}

/* Mahlzeit als einen Eintrag ins Tagebuch. */
function enter(name, items, day, label){
  const t = ML.sumItems(items);
  H.add({ n:name, k:Math.round(t.k), p:Math.round(t.p * 10) / 10 }, day);
  toast("Eingetragen: " + name + " · " + Math.round(t.k) + " kcal (" + (label || dlabel(day)) + ")");
}

function saveMeal(name, items){
  const list = meals();
  const stored = items.map(ML.storeItem);
  let id = S.editId;
  const same = list.findIndex(m => m.id === id || (!id && m.n.toLowerCase() === name.toLowerCase()));
  if (same >= 0) { id = list[same].id; list[same] = { id, n:name, items:stored, u:Date.now() }; }
  else { id = "ml" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); list.push({ id, n:name, items:stored, u:Date.now() }); }
  if (list.length > 100) list.shift();
  dsave();
  return id;
}

/* ---------- KI-Schätzung (optional) ---------- */
async function askAi(btn){
  const text = S.text.trim();
  if (!text) { toast("Tippe zuerst, was du gegessen hast"); return; }
  btn.disabled = true;
  btn.textContent = "Die KI schätzt …";
  const list = await fetchMeal(text);
  const items = list ? ML.mealItemsFromAi(list) : [];
  const b2 = $("#ml-ai");
  if (b2) { b2.disabled = false; b2.textContent = "Mit KI schätzen"; }
  if (!$("#mlp") || $("#mlp").hidden) return;
  if (items.length) {
    S.extra.push(...items);
    S.text = ""; S.ov = {}; S.man = {}; S.typing = false;
    const ti = $("#ml-t"); if (ti) ti.value = "";
    S.ai = "KI-Schätzung, grob. Bitte Mengen und Werte prüfen. Passende Lebensmittel nutzen die Werte der App-Datenbank.";
  } else {
    S.ai = "Die KI ist gerade nicht erreichbar. Es gilt die lokale Erkennung.";
  }
  paint();
}

/* ---------- Bedienung ---------- */
function rowOf(i){ return S.view && S.view.rows[i]; }
function mutate(r, fn){
  /* Menge ändern und als Überschreibung merken, damit sie beim nächsten Parsen erhalten bleibt. */
  const it = Object.assign({}, r.it);
  fn(it);
  if (r.ref.x != null) { S.extra[r.ref.x] = it; }
  else if (r.ref.man) { const m = S.man[r.ref.t] || (S.man[r.ref.t] = {}); m.c = it.c; }
  else { const o = S.ov[r.ref.t] || (S.ov[r.ref.t] = {}); o.c = it.c; o.ul = it.ul; o.ug = it.ug; }
}

export function bindMeal(h){
  H = Object.assign(H, h || {});
  document.addEventListener("input", ev => {
    const id = ev.target.id;
    if (id === "ml-t") { S.text = ev.target.value; S.typing = true; S.ai = null; paint(); }
    else if (id === "ml-s") paintSearch(ev.target.value);
    else if (id === "ml-n") { S.name = ev.target.value; S.nameSet = ev.target.value.trim() !== ""; if (!S.nameSet) { S.name = ""; } paint(); }
  });
  document.addEventListener("focusout", ev => { if (ev.target.id === "ml-t" && S.typing) { S.typing = false; paint(); } });
  document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.id === "ml-t") { ev.preventDefault(); S.typing = false; ev.target.blur(); paint(); } });
  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.dataset && t.dataset.mlin !== undefined) {
      const r = rowOf(+t.dataset.mlin);
      if (r) { mutate(r, it => ML.setAmount(it, String(t.value).replace(",", "."))); }
      paint();
    } else if (t.id === "ml-d") {
      if (t.value && t.value <= dkey(new Date())) { S.day = t.value; const d = $("#ml-day"); if (d) d.innerHTML = dayChips(); paint(); }
    }
  });
  document.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.mlopen !== undefined) { openMeal(); return; }
    /* Liste im Tagebuch */
    if (d.mlfe !== undefined) {
      const m = meals()[+d.mlfe];
      if (m) { enter(m.n, m.items, ui.dyk); H.redraw(); }
      return;
    }
    if (d.mled !== undefined) { openMeal({ edit:+d.mled }); return; }
    if (d.mlfx !== undefined) {
      const i = +d.mlfx, m = meals()[i];
      if (!m) return;
      meals().splice(i, 1);
      dsave();
      H.redraw();
      toast("Gelöscht: " + m.n, { label:"Rückgängig", run(){ meals().splice(Math.min(i, meals().length), 0, m); dsave(); H.redraw(); } });
      return;
    }
    const e = $("#mlp");
    if (!e || e.hidden || !e.contains(b)) return;
    if (d.mlclose !== undefined) { closeMeal(); return; }
    if (d.mlday) { S.day = d.mlday; const x = $("#ml-day"); if (x) x.innerHTML = dayChips(); paint(); return; }
    if (d.mlfq !== undefined) {
      const m = meals()[+d.mlfq];
      if (!m) return;
      const day = S.day;
      enter(m.n, m.items, day);
      finish(day);
      return;
    }
    if (d.mlai !== undefined) { askAi(b); return; }
    if (d.mlbc !== undefined) {
      document.dispatchEvent(new CustomEvent("kp:scan", { detail:{ done:item => { S.extra.push(item); paint(); } } }));
      return;
    }
    if (d.mls !== undefined) {
      const [i, s] = d.mls.split(":");
      const r = rowOf(+i);
      if (r) mutate(r, it => ML.stepItem(it, +s));
      paint();
      return;
    }
    if (d.mlu !== undefined) { const r = rowOf(+d.mlu); if (r) mutate(r, it => ML.toggleUnit(it)); paint(); return; }
    if (d.mlrm !== undefined) {
      const r = rowOf(+d.mlrm);
      if (!r) return;
      if (r.ref.x != null) S.extra.splice(r.ref.x, 1);
      else if (r.ref.man) S.man[r.ref.t] = { rm:1 };
      else (S.ov[r.ref.t] || (S.ov[r.ref.t] = {})).rm = 1;
      paint();
      return;
    }
    if (d.mlalt !== undefined) {
      const [i, j] = d.mlalt.split(":").map(Number);
      const r = rowOf(i);
      if (!r || r.ref.t == null) return;
      const nf = r.it.alts[j];
      if (!nf) return;
      const nit = ML.rebase(r.it, nf);
      S.ov[r.ref.t] = { fi:j, c:nit.c, ul:nit.ul, ug:nit.ug };
      paint();
      return;
    }
    if (d.mlurm !== undefined) {
      const u = S.view && S.view.unk[+d.mlurm];
      if (u) { S.man[u.key] = { rm:1 }; paint(); }
      return;
    }
    if (d.mluadd !== undefined) {
      const i = +d.mluadd, u = S.view && S.view.unk[i];
      const k = parseFloat(String(($(`#ml-uk${i}`) || {}).value || "").replace(",", ".")), p = parseFloat(String(($(`#ml-up${i}`) || {}).value || "").replace(",", ".")) || 0;
      if (!u) return;
      if (!(k >= 0) || Number.isNaN(k)) { toast("Bitte kcal pro Portion eintragen"); return; }
      S.man[u.key] = { k, p };
      paint();
      return;
    }
    if (d.mlsa !== undefined) {
      const out = $("#ml-sr"), f = out && out._f && out._f[+d.mlsa];
      if (f) {
        S.extra.push(ML.defaultItem(f, ML.shortName(f.n), 0));
        const si = $("#ml-s"); if (si) si.value = "";
        paintSearch("");
        paint();
      }
      return;
    }
    if (d.mlgo !== undefined || d.mlsave !== undefined) {
      const items = S.view ? S.view.rows.map(r => r.it) : [];
      if (!items.length) { toast("Noch keine Zutat"); return; }
      const name = (S.view.name || "").trim() || "Mahlzeit";
      if (d.mlsave !== undefined) {
        saveMeal(name, items);
        toast("Gespeichert: " + name);
        if (S.editId) { finish(null); } else { S.nameSet = true; S.name = name; S.editId = null; const diaryOpen = ui.pm === "Y" && !$("#pnl").hidden; if (diaryOpen) H.redraw(); paint(); }
        return;
      }
      const day = S.day;
      enter(name, items, day);
      finish(day);
    }
  });
}
