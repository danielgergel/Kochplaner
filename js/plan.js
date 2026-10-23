import { catalog, ST, ui, persist } from "./state.js";
import { $, esc, toast, WD } from "./util.js";
import { metaOf, grp, CGRP } from "./recipes.js";
import { badgeOf, haystack } from "./recipe-badge.js";
import { showPanel, closePanel } from "./panels.js";

const WS = [["F","Frühstück","Frühstück"],["M","Mittag","Snack & Beilage"],["H","Hauptmahlzeit","Hauptmahlzeit"],["A","Abend","Snack & Beilage"]];

export function planHtml(){
  const dn = ST.done || (ST.done = {});
  let dch = 0;
  Object.keys(dn).forEach(k => { if (!ST.sel[k]) { delete dn[k]; dch = 1; } });
  if (dch) persist();
  const ids = Object.keys(ST.sel);
  let body;
  if (!ids.length) body = '<p class="empty">Noch nichts im Plan. Tippe bei den Rezepten auf das Plus, zum Beispiel für zwei Gerichte über zwei Tage. Daraus entsteht deine Einkaufsliste.</p>';
  else {
    const n = ids.reduce((a, i) => a + ST.sel[i], 0), nd = ids.filter(i => dn[i]).length;
    body = `<div class="sum"><b>${n}× kochen</b> aus ${ids.length} Rezept${ids.length > 1 ? "en" : ""}${nd ? `, davon <b>${nd} gegessen</b>` : ""}. Mengen gelten für 2 Personen. Weiter zum <b>Einkauf</b> für die Liste.</div>` +
      ids.map(id => {
        const r = catalog.all[id], g = !!dn[id];
        return `<div class="prow${g ? " gk" : ""}"><div class="nm"><span class="id">${esc(badgeOf(r.id, ST.cust))}</span> <b>${esc(r.n)}</b><span class="meta">${metaOf(r)}</span></div>
    <div class="step"><button data-dec="${id}" aria-label="Einmal weniger">−</button><span>${ST.sel[id]}×</span><button data-inc="${id}" aria-label="Einmal mehr">+</button></div>
    <div class="acts"><button class="btn${g ? "" : " pri"}" data-open="${id}">Kochen</button><button class="btn" data-gk="${id}" aria-pressed="${g}">${g ? "Gegessen ✓" : "Als gegessen markieren"}</button></div></div>`;
      }).join("") +
      (nd ? `<button class="btn" id="clrdone" style="width:100%;margin-top:6px">Erledigte entfernen (${nd})</button>` : "") +
      `<button class="btn warn" id="clr" style="width:100%;margin-top:8px">Plan leeren</button>`;
  }
  return body + weekBlock();
}

function weekBlock(){
  const wk = ST.week || {};
  let n = 0;
  const days = WD.map(([k, name]) => {
    const rows = WS.map(([s, sn]) => {
      const id = (wk[k] || {})[s], r = id && catalog.all[id];
      if (r) n++;
      return `<button class="ck" data-wk="${k}:${s}" style="grid-template-columns:96px 1fr;min-height:48px"><span class="l" style="color:var(--muted);font-size:14px">${sn}</span><span class="l" style="${r ? "" : "color:var(--muted)"}">${r ? esc(r.n) : "+ auswählen"}</span></button>`;
    }).join("");
    return `<h4 style="margin:12px 0 4px;font-family:var(--f-disp);font-size:19px;letter-spacing:.03em">${name}</h4><div class="box">${rows}</div>`;
  }).join("");
  return `<details class="fold" data-k="Wochenplan"${ui.foldOpen["Wochenplan"] ? " open" : ""}><summary>Wochenplan (optional)</summary>
   <p class="note" style="margin:0 0 4px">Lege fest, was an welchem Tag gegessen wird. Mit dem Knopf unten landen alle Gerichte im Plan und in der Einkaufsliste.</p>
   ${days}
   <div class="stack"><button class="btn pri" data-wkapply>${n ? "In Plan und Einkauf übernehmen (" + n + ")" : "In Plan und Einkauf übernehmen"}</button><button class="btn warn" id="wkclr">Woche leeren</button></div></details>`;
}

function wkListHtml(){
  const q = ui.wkq.trim().toLowerCase();
  const rows = catalog.ALL.filter(r => (ui.wkg === "Alle" || grp(r) === ui.wkg) && (!q || haystack(r, ST.cust).includes(q)));
  if (!rows.length) return '<p class="empty">Kein Rezept gefunden.</p>';
  return rows.map(r => `<div class="rc" style="grid-template-columns:1fr"><button class="rb" data-wkpick="${r.id}"><span class="top"><span class="id">${esc(badgeOf(r.id, ST.cust))}</span><b>${esc(r.n)}</b></span><span class="meta">${metaOf(r)}</span></button></div>`).join("");
}
function wkHtml(){
  const day = WD.find(x => x[0] === ui.wkSel.d)[1];
  const sl = WS.find(x => x[0] === ui.wkSel.s)[1];
  const cur = (ST.week[ui.wkSel.d] || {})[ui.wkSel.s];
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Abbrechen</button></div></div>
  <div class="dbody"><h2>${day}: ${sl}</h2>
  <input id="wkq" class="finp" type="search" placeholder="Rezept suchen" value="${esc(ui.wkq)}" aria-label="Rezept suchen">
  <div class="chips" id="wkc">${["Alle"].concat(Object.keys(CGRP)).map(g => `<button data-wkg="${g}" aria-pressed="${g === ui.wkg}">${g}</button>`).join("")}</div>
  ${cur ? `<div class="stack"><button class="btn warn" data-wkempty>Aus diesem Platz entfernen</button></div>` : ""}
  <div id="wkl" style="margin-top:10px">${wkListHtml()}</div></div>`;
}
function openWk(d, s){
  ui.wkSel = { d, s };
  ui.wkq = "";
  ui.wkg = WS.find(x => x[0] === s)[2];
  ui.pm = "W";
  showPanel(wkHtml());
}

export function bindPlan(){
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.wk && ui.tab === "P") { const [a, b] = d.wk.split(":"); openWk(a, b); return; }
    if (d.wkapply !== undefined) {
      const cnt = {};
      Object.keys(ST.week).forEach(k => Object.keys(ST.week[k] || {}).forEach(s => {
        const id = ST.week[k][s];
        if (id && catalog.all[id]) cnt[id] = (cnt[id] || 0) + 1;
      }));
      const ids = Object.keys(cnt);
      if (!ids.length) { toast("Der Wochenplan ist noch leer"); return; }
      ids.forEach(id => { ST.sel[id] = Math.min(9, cnt[id]); });
      persist();
      ui.render();
      toast(ids.length + " Rezepte im Plan");
      return;
    }
    if (t.id === "wkclr") {
      if (t.dataset.c) { ST.week = {}; persist(); ui.render(); toast("Woche geleert"); }
      else { t.dataset.c = 1; t.textContent = "Wirklich leeren?"; setTimeout(() => { if (t.isConnected) { delete t.dataset.c; t.textContent = "Woche leeren"; } }, 3500); }
      return;
    }
    if (ui.pm === "W" && !$("#pnl").hidden && ui.wkSel) {
      if (d.wkpick) {
        const w = (ST.week[ui.wkSel.d] || (ST.week[ui.wkSel.d] = {}));
        w[ui.wkSel.s] = d.wkpick;
        persist();
        closePanel();
        return;
      }
      if (d.wkempty !== undefined) {
        if (ST.week[ui.wkSel.d]) delete ST.week[ui.wkSel.d][ui.wkSel.s];
        persist();
        closePanel();
        return;
      }
      if (d.wkg) {
        ui.wkg = d.wkg;
        document.querySelectorAll("#wkc button").forEach(b => b.setAttribute("aria-pressed", b.dataset.wkg === ui.wkg));
        $("#wkl").innerHTML = wkListHtml();
      }
    }
  });
  document.addEventListener("input", ev => {
    if (ev.target.id === "wkq") { ui.wkq = ev.target.value; const w = $("#wkl"); if (w) w.innerHTML = wkListHtml(); }
  });
}
