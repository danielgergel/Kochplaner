import { catalog, DY, ST, ui, dsave, persist } from "./state.js";
import { $, esc, toast, f1, dkey, dlabel, WDSHORT } from "./util.js";
import { grp } from "./recipes.js";
import { parsePiece, calcPiece } from "./nutrition.js";
import { showPanel } from "./panels.js";

export function tot(k){
  const e = DY.days[k] || [];
  let ks = 0, ps = 0;
  for (const x of e) {
    const m = Number(x.m), kk = Number(x.k), pp = Number(x.p);
    if (!Number.isFinite(m) || !Number.isFinite(kk) || !Number.isFinite(pp)) continue;
    ks += kk * m;
    ps += pp * m;
  }
  return { k:ks, p:ps };
}

export function addEntry(e, k){
  const key = k || ui.dyk;
  (DY.days[key] || (DY.days[key] = [])).push(Object.assign({ m:1 }, e));
  const keys = Object.keys(DY.days).sort();
  while (keys.length > 400) delete DY.days[keys.shift()];
  dsave();
}

export function markEaten(id){
  const r = catalog.all[id];
  if (!r) return;
  addEntry({ n:r.n, k:r.k, p:r.p, rid:id, gk:1 }, dkey(new Date()));
  if (ST.sel[id]) { (ST.done || (ST.done = {}))[id] = 1; persist(); }
}

export function unmarkEaten(id){
  const key = dkey(new Date()), a = DY.days[key] || [];
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i].rid === id && a[i].gk) { a.splice(i, 1); dsave(); break; }
  }
  if (ST.done) delete ST.done[id];
  persist();
}

function barHtml(v, g, min){
  const pct = g ? Math.min(100, v / g * 100) : 0;
  return `<div class="bar${!min && v > g ? " over" : ""}"><i style="width:${pct}%"></i></div>`;
}

let QP = [];
function qParse(text){
  QP = text.replace(/(\d),(\d)/g, "$1§$2").split(/\s*(?:,|\+|&|\bund\b|\bplus\b|\bmit\b)\s*/i).map(p => parsePiece(p.replace(/§/g, ","))).filter(Boolean);
}
function qHtml(){
  if (!QP.length) return "";
  let tk = 0, tp = 0, ok = 0;
  const rows = QP.map((pc, i) => {
    const c = calcPiece(pc);
    if (!c) return `<div class="ent" style="grid-template-columns:1fr"><b>${esc(pc.raw)}</b><span class="meta">Nicht gefunden. Trag Kalorien und Eiweiß unten selbst ein oder scanne den Barcode.</span></div>`;
    ok++; tk += c.k; tp += c.p;
    const alts = pc.foods.map((f, j) => j === pc.fi ? "" : `<button class="chipb" data-qalt="${i}:${j}">${esc(f.n)}</button>`).join("");
    return `<div class="ent" style="grid-template-columns:1fr"><b>${esc(c.f.n)} · ${esc(c.label)}</b><span class="meta">${Math.round(c.k)} kcal · ${f1(c.p)} g Eiweiß</span>${alts ? `<div class="alts">Meintest du: ${alts}</div>` : ""}</div>`;
  }).join("");
  return `<div class="box" style="margin-top:6px">${rows}</div>` + (ok ? `<button class="btn pri" data-qadd style="width:100%;margin-top:8px">Eintragen: ${Math.round(tk)} kcal · ${f1(tp)} g Eiweiß</button>` : "");
}

function suggestHtml(){
  if (ui.dyk !== dkey(new Date())) return "";
  const t = tot(ui.dyk), G = DY.goal, rp = G.p - t.p, rk = G.k - t.k;
  if (rp <= 0) return `<h3 class="sec">Vorschläge</h3><p class="empty" style="padding:6px 0">Dein Eiweiß-Ziel für heute ist erreicht.</p>`;
  const rate = ST.rate || {};
  let pool;
  if (rk > 60) {
    pool = catalog.ALL.filter(r => r.p >= 8 && r.k > 0 && r.k <= rk * 1.25).map(r => {
      const cov = Math.min(r.p, rp) / rp, dens = r.p / r.k * 100, fit = r.k <= rk ? 1 : Math.max(0, 1 - (r.k - rk) / rk);
      return { r, s:cov * 60 + Math.min(dens, 12) * 2.5 + fit * 25 + (rate[r.id] || 0) * 3 - (grp(r) === "Dessert" ? 15 : 0) };
    });
  } else {
    pool = catalog.ALL.filter(r => r.p >= 8 && r.k > 0 && r.k <= 220).map(r => ({ r, s:r.p / r.k * 100 + (rate[r.id] || 0) }));
  }
  pool.sort((a, b) => b.s - a.s);
  const pick = [], cnt = {};
  for (const x of pool) {
    const g = grp(x.r);
    if ((cnt[g] || 0) >= 2) continue;
    pick.push(x.r);
    cnt[g] = (cnt[g] || 0) + 1;
    if (pick.length === 3) break;
  }
  const head = `<h3 class="sec">Vorschläge</h3><p class="note" style="margin:0 0 6px">Noch ${f1(rp)} g Eiweiß und ${Math.max(0, Math.round(rk))} kcal offen.${rk <= 60 ? " Das Kalorienziel ist fast erreicht, deshalb nur leichte Sachen mit viel Eiweiß." : ""}</p>`;
  if (!pick.length) return head + '<p class="empty" style="padding:6px 0">Dazu passt gerade kein Rezept. Ein Shake oder Quark geht immer.</p>';
  return head + `<div class="box">` + pick.map(r => `<div class="ent"><button class="sugn" data-sgopen="${r.id}"><b>${esc(r.n)}</b><span class="meta">+${r.p} g Eiweiß · ${r.k} kcal</span></button><div class="eac"><button class="btn" data-sgadd="${r.id}" style="width:auto;padding:0 14px;height:44px">Eintragen</button></div></div>`).join("") + `</div>`;
}

function last7(){
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dkey(d);
    days.push({ key, wd:WDSHORT[d.getDay()], today:i === 0, ...tot(key) });
  }
  return days;
}

function bars(rows, key, max, goal){
  const W = 336, H = 132, base = 100, n = rows.length;
  const slot = (W - 8) / n, bw = slot - 8;
  const yTarget = base - (goal / max) * (base - 16);
  let body = `<line x1="4" x2="${W - 4}" y1="${yTarget.toFixed(1)}" y2="${yTarget.toFixed(1)}" stroke="currentColor" stroke-dasharray="4 3" stroke-width="1.2" opacity="0.55"/>`;
  rows.forEach((r, i) => {
    const v = r[key];
    const h = Math.max(v > 0 ? 2 : 0, (v / max) * (base - 16));
    const x = 4 + i * slot + 4;
    const y = base - h;
    const fill = v > goal ? "var(--warn)" : "var(--accent)";
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}" opacity="${r.today ? 1 : 0.85}"/>`;
    body += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="12" font-weight="${r.today ? 700 : 500}" fill="currentColor">${r.wd}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${body}</svg>`;
}

function weekChartHtml(){
  const rows = last7();
  const G = DY.goal || { k:2100, p:150 };
  const maxK = Math.max(G.k, ...rows.map(r => r.k), 1);
  const maxP = Math.max(G.p, ...rows.map(r => r.p), 1);
  const sumK = rows.reduce((a, r) => a + r.k, 0);
  const sumP = rows.reduce((a, r) => a + r.p, 0);
  const list = `<div class="box" style="margin-top:8px">${rows.map(r => `<div class="wk7"><span>${r.wd}${r.today ? " · heute" : ""}</span><span>${barHtml(r.k, G.k)}</span><span>${Math.round(r.k)} kcal · ${Math.round(r.p)} g</span></div>`).join("")}</div>`;
  return `<h3 class="sec">Wochenbilanz</h3>
  <div class="chartbox chart">
    <div class="cap"><b>Kalorien</b><span>Tagesziel ${G.k} kcal</span></div>
    ${bars(rows, "k", maxK, G.k)}
    <div class="cap"><b>Eiweiß</b><span>Tagesziel ${G.p} g</span></div>
    ${bars(rows, "p", maxP, G.p)}
    <p class="note">Sieben Tage zusammen ${Math.round(sumK)} kcal (Ziel ${G.k * 7}) und ${f1(sumP)} g Eiweiß (Ziel ${G.p * 7}). Die gestrichelte Linie ist dein Tagesziel. Balken über dem Ziel sind hervorgehoben.</p>
    ${list}
    <h3 class="sec">Tagesziel</h3>
    <div class="frm"><label>kcal<input id="dg-k" inputmode="numeric" value="${G.k}"></label><label>Eiweiß (g)<input id="dg-p" inputmode="numeric" value="${G.p}"></label></div>
  </div>`;
}

const FOLD = ["Rezept eintragen","Eigener Eintrag","Meine Lebensmittel"];
function fold(title, body){
  if (!FOLD.includes(title)) return `<h3 class="sec">${title}</h3>${body}`;
  return `<details class="fold" data-k="${esc(title)}"${ui.foldOpen[title] ? " open" : ""}><summary>${esc(title)}</summary>${body}</details>`;
}

function dyResHtml(){
  const q = ui.dyq.trim().toLowerCase();
  let rows;
  if (q) rows = catalog.ALL.filter(r => (r.n + " " + r.id).toLowerCase().includes(q)).slice(0, 8);
  else {
    const seen = new Set();
    rows = [];
    Object.keys(DY.days).sort().reverse().forEach(d => (DY.days[d] || []).slice().reverse().forEach(e => {
      if (e.rid && catalog.all[e.rid] && !seen.has(e.rid) && rows.length < 6) { seen.add(e.rid); rows.push(catalog.all[e.rid]); }
    }));
  }
  if (!rows.length) return '<p class="empty">' + (q ? "Kein Rezept gefunden." : "Suche ein Rezept, dann tippst du es an.") + "</p>";
  return `<div class="box">` + rows.map(r => `<button class="ck" data-dyr="${r.id}" style="grid-template-columns:1fr auto"><span class="l">${esc(r.n)}<small>${r.k} kcal · ${r.p} g Eiweiß pro Person</small></span><span class="q">+ 1 Portion</span></button>`).join("") + `</div>`;
}

export function dyHtml(){
  const t = tot(ui.dyk), G = DY.goal || { k:2100, p:150 }, ents = DY.days[ui.dyk] || [];
  const undo = ui.undo ? `<div class="undo"><span>Gelöscht: ${esc(ui.undo.e.n)}</span><button class="btn" data-dyundo>Rückgängig</button></div>` : "";
  const eaten = ents.length ? `<div class="box">` + ents.map((e, i) => `<div class="ent"><b>${esc(e.n)}</b><span class="meta">${Math.round(e.k * e.m)} kcal · ${f1(e.p * e.m)} g Eiweiß</span><div class="eac"><button data-dym="${i}:-0.5" aria-label="Weniger">−</button><span>${f1(e.m)}×</span><button data-dym="${i}:0.5" aria-label="Mehr">+</button><button data-dyx="${i}" aria-label="Löschen">×</button></div></div>`).join("") + `</div>` : '<p class="empty">An diesem Tag ist noch nichts eingetragen.</p>';
  const foods = DY.foods.length ? fold("Meine Lebensmittel", `<div class="box">` + DY.foods.map((f, i) => `<div class="ent"><b>${esc(f.n)}</b><span class="meta">${f.k} kcal · ${f1(f.p)} g Eiweiß</span><div class="eac"><button data-dyf="${i}" aria-label="Heute eintragen" style="width:auto;padding:0 12px">+ Heute</button><button data-dyfx="${i}" aria-label="Aus der Liste löschen">×</button></div></div>`).join("") + `</div>`) : "";
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Schließen</button><span class="wk">Nur auf diesem Handy gespeichert</span></div></div>
  <div class="dbody"><h2>Tagebuch</h2>
  <div class="dnav"><button data-dyd="-1" aria-label="Vorheriger Tag">‹</button><b>${dlabel(ui.dyk)}</b><button data-dyd="1" aria-label="Nächster Tag">›</button></div>
  <div class="tot"><div><div class="row1"><b>${Math.round(t.k)} kcal</b><span>Ziel ${G.k} · noch ${Math.round(G.k - t.k)}</span></div>${barHtml(t.k, G.k)}</div>
   <div><div class="row1"><b>${f1(t.p)} g Eiweiß</b><span>Ziel ${G.p} · noch ${f1(G.p - t.p)}</span></div>${barHtml(t.p, G.p, true)}</div></div>
  ${weekChartHtml()}
  <h3 class="sec">Schnell eintragen</h3>
  <input id="qk" class="finp" placeholder="z. B. 4 Kaffee, 2 Brötchen mit Butter, Pommes" autocomplete="off" autocapitalize="none" aria-label="Was hast du gegessen oder getrunken?">
  <div id="qkp">${qHtml()}</div>
  <div class="stack"><button class="btn" data-scan>Barcode scannen</button></div>
  ${undo}
  <h3 class="sec">Gegessen</h3>
  ${eaten}
  ${suggestHtml()}
  ${fold("Rezept eintragen", `<input id="dyq" class="finp" type="search" placeholder="Rezept suchen" value="${esc(ui.dyq)}" aria-label="Rezept suchen"><div id="dyres">${dyResHtml()}</div>`)}
  ${fold("Eigener Eintrag", `<div class="frm"><label class="full">Name<input id="dy-n" placeholder="z. B. Kantine Pommes"></label>
   <label>kcal<input id="dy-k" inputmode="numeric" placeholder="450"></label><label>Eiweiß (g)<input id="dy-p" inputmode="decimal" placeholder="5"></label>
   <label class="chk2 full"><input type="checkbox" id="dy-s" checked>In „Meine Lebensmittel“ merken</label>
   <button class="btn pri full" data-dyown>Eintragen</button></div>`)}
  ${foods}
  </div>`;
}

export function drawDy(keep){
  QP = [];
  const pnl = $("#pnl");
  const y = pnl.scrollTop;
  pnl.innerHTML = dyHtml();
  pnl.scrollTop = keep ? y : 0;
}
export function openDy(){
  ui.pm = "Y";
  ui.dyq = "";
  ui.undo = null;
  ui.dyk = dkey(new Date());
  showPanel("");
  drawDy(false);
}

export function bindDiary(){
  document.addEventListener("input", ev => {
    if (ev.target.id === "dyq") { ui.dyq = ev.target.value; const r = $("#dyres"); if (r) r.innerHTML = dyResHtml(); }
    if (ev.target.id === "dg-k" || ev.target.id === "dg-p") {
      const v = parseInt(ev.target.value, 10) || 0;
      if (v > 0) { if (ev.target.id === "dg-k") DY.goal.k = v; else DY.goal.p = v; dsave(); }
    }
    if (ev.target.id === "qk") { qParse(ev.target.value); const box = $("#qkp"); if (box) box.innerHTML = qHtml(); }
  });
  document.addEventListener("change", ev => {
    if (ev.target.id === "dg-k" || ev.target.id === "dg-p") drawDy(true);
  });
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (t.id === "bdy") { openDy(); return; }
    if (d.dyadd) {
      const r = catalog.all[d.dyadd];
      if (!r) return;
      if (ST.done && ST.done[r.id]) { toast("Schon als gegessen eingetragen"); return; }
      markEaten(r.id);
      toast("Ins Tagebuch eingetragen: " + r.n);
      if (ui.openId) ui.redrawDetail();
      return;
    }
    if (d.gk) {
      const dn = ST.done || (ST.done = {});
      if (dn[d.gk]) { unmarkEaten(d.gk); toast("Aus dem Tagebuch entfernt"); }
      else { markEaten(d.gk); toast("Ins Tagebuch eingetragen"); }
      const y = window.scrollY;
      ui.render();
      window.scrollTo(0, y);
      return;
    }
    if (t.id === "clrdone") {
      const dn = ST.done || {};
      Object.keys(dn).forEach(k => { delete ST.sel[k]; delete dn[k]; });
      persist();
      ui.render();
      toast("Erledigte entfernt");
      return;
    }
    if (ui.pm === "Y" && !$("#pnl").hidden) {
      if (d.dyd) {
        const x = new Date(ui.dyk + "T12:00:00");
        x.setDate(x.getDate() + parseInt(d.dyd, 10));
        if (dkey(x) <= dkey(new Date())) { ui.dyk = dkey(x); drawDy(false); }
        return;
      }
      if (d.dyr) {
        const r = catalog.all[d.dyr];
        addEntry({ n:r.n, k:r.k, p:r.p, rid:r.id });
        ui.dyq = "";
        drawDy(true);
        toast("Eingetragen");
        return;
      }
      if (d.dym) {
        const [i, s] = d.dym.split(":");
        const e = DY.days[ui.dyk][+i];
        e.m = Math.max(0.5, e.m + parseFloat(s));
        dsave();
        drawDy(true);
        return;
      }
      if (d.dyx) {
        ui.undo = { k:ui.dyk, i:+d.dyx, e:DY.days[ui.dyk][+d.dyx] };
        DY.days[ui.dyk].splice(+d.dyx, 1);
        dsave();
        drawDy(true);
        return;
      }
      if (d.dyundo !== undefined && ui.undo) {
        const a = DY.days[ui.undo.k] || (DY.days[ui.undo.k] = []);
        a.splice(Math.min(ui.undo.i, a.length), 0, ui.undo.e);
        ui.undo = null;
        dsave();
        drawDy(true);
        toast("Wiederhergestellt");
        return;
      }
      if (d.dyown !== undefined) {
        const n = $("#dy-n").value.trim(), k = parseFloat($("#dy-k").value.replace(",", ".")) || 0, p = parseFloat($("#dy-p").value.replace(",", ".")) || 0;
        if (!n) { toast("Bitte einen Namen eintragen"); return; }
        if (k <= 0 && p <= 0) { toast("Bitte kcal eintragen"); return; }
        addEntry({ n, k, p });
        if ($("#dy-s").checked && !DY.foods.some(f => f.n.toLowerCase() === n.toLowerCase())) { DY.foods.push({ n, k, p }); dsave(); }
        drawDy(true);
        toast("Eingetragen");
        return;
      }
      if (d.dyf !== undefined) { const f = DY.foods[+d.dyf]; addEntry({ n:f.n, k:f.k, p:f.p }); drawDy(true); toast("Eingetragen"); return; }
      if (d.dyfx !== undefined) { DY.foods.splice(+d.dyfx, 1); dsave(); drawDy(true); return; }
      if (d.qalt) { const [i, j] = d.qalt.split(":").map(Number); QP[i].fi = j; $("#qkp").innerHTML = qHtml(); return; }
      if (d.qadd !== undefined) {
        let n = 0;
        QP.forEach(pc => { const c = calcPiece(pc); if (c) { addEntry({ n:c.f.n + " (" + c.label + ")", k:c.k, p:c.p }); n++; } });
        QP = [];
        drawDy(true);
        toast(n + " Eintrag" + (n > 1 ? "e" : "") + " gespeichert");
        return;
      }
      if (d.sgadd) { markEaten(d.sgadd); drawDy(true); toast("Eingetragen"); return; }
      if (d.sgopen) { ui.closePanel(); ui.openRecipe(d.sgopen); return; }
    }
  });
  document.addEventListener("toggle", ev => {
    const d = ev.target;
    if (d && d.classList && d.classList.contains("fold")) ui.foldOpen[d.dataset.k] = d.open;
  }, true);
}
