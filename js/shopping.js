import { ST, ui, persist } from "./state.js";
import { $, esc, toast, ck, dkey } from "./util.js";
import { CATS, shopList } from "./shopcalc.js";
import { offersHtml, refreshOffers } from "./offers.js";

export const CHECK_MS = 30 * 60 * 1000;

export function expireChecked(sc, extra, sx, now, ms){
  const nextSc = Object.assign({}, sc || {});
  const nextSx = Object.assign({}, sx || {});
  let changed = false;
  const limit = ms == null ? CHECK_MS : ms;
  for (const [k, v] of Object.entries(nextSc)) {
    const n = typeof v === "number" ? v : 0;
    if (n > 1e11 && now - n >= limit) {
      delete nextSc[k];
      nextSx[k] = 1;
      changed = true;
    }
  }
  const nextExtra = (extra || []).filter(x => {
    if (x && x.d && typeof x.at === "number" && x.at > 1e11 && now - x.at >= limit) { changed = true; return false; }
    return true;
  });
  return { sc: nextSc, extra: nextExtra, sx: nextSx, changed };
}

function ensureMaps(){
  if (!ST.sc || typeof ST.sc !== "object" || Array.isArray(ST.sc)) ST.sc = {};
  if (!ST.sx || typeof ST.sx !== "object" || Array.isArray(ST.sx)) ST.sx = {};
  if (!Array.isArray(ST.extra)) ST.extra = [];
}

export function applyExpire(now){
  ensureMaps();
  const r = expireChecked(ST.sc, ST.extra, ST.sx, now || Date.now(), CHECK_MS);
  if (!r.changed) return false;
  ST.sc = r.sc;
  ST.extra = r.extra;
  ST.sx = r.sx;
  persist();
  return true;
}

function hidden(key){ return !!(ST.sx && ST.sx[key]); }

function checkedN(){
  ensureMaps();
  let n = 0;
  if (nSel()) {
    const L = shopList(ST.sel);
    CATS.forEach(c => (L.out[c] || []).forEach(x => { if (ST.sc[x.key] && !hidden(x.key)) n++; }));
    (L.vor || []).forEach(v => { if (ST.sc["V|" + v] && !hidden("V|" + v)) n++; });
  }
  exList().forEach(x => { if (x && x.d) n++; });
  return n;
}

const STORES = ["REWE","Lidl","Aldi","Edeka","Kaufland","Penny","Netto","Anderer"];
const okDate = u => typeof u === "string" && /^\d{4}-\d{2}-\d{2}$/.test(u);
const ofDate = u => { if (!okDate(u)) return ""; const [a, b, c] = u.split("-"); return " bis " + c + "." + b + "."; };
function manualHtml(){
  const today = dkey(new Date());
  const list = (ST.offers || []).map((o, i) => `<div class="ent"><b>${esc(o.i)}</b><span class="meta">${esc(o.s)} · ${esc(o.pr || "")}${o.pr && !/€/.test(o.pr) ? " €" : ""}${ofDate(o.u)}${o.u && o.u < today ? " · abgelaufen" : ""}</span><div class="eac"><button data-ofx="${i}" aria-label="Angebot löschen">×</button></div></div>`).join("");
  return `<h3 class="sec">Angebot eintragen</h3>
  <div class="frm">
   <label class="full">Artikel<input id="of-i" placeholder="z. B. Hähnchenbrust" autocomplete="off"></label>
   <label>Händler<select id="of-s">${STORES.map(s => `<option>${s}</option>`).join("")}</select></label>
   <label>Preis<input id="of-p" inputmode="decimal" placeholder="1,99"></label>
   <label class="full">Gültig bis (optional)<input id="of-u" type="date"></label>
   <button class="btn pri full" data-ofadd>Angebot speichern</button>
  </div>
  ${ST.offers.length ? `<div class="box" style="margin-top:10px">${list}</div>` : ""}`;
}

const XSUG = ["Backpapier","Küchenrolle","Salz","Alufolie","Gefrierbeutel","Spülmittel"];
function exList(){ if (!Array.isArray(ST.extra)) ST.extra = []; return ST.extra; }
function exHtml(){
  const L = exList(), have = new Set(L.map(x => String(x.t).toLowerCase()));
  const sug = XSUG.filter(s => !have.has(s.toLowerCase()));
  const items = L.map((x, i) => `<div style="display:flex;align-items:stretch"><button class="ck" role="checkbox" aria-checked="${!!x.d}" data-exck="${i}" style="grid-template-columns:30px 1fr;flex:1"><i>${ck}</i><span class="l">${esc(x.t)}</span></button><button data-exdel="${i}" aria-label="${esc(x.t)} löschen" style="width:46px;border:0;background:transparent;font-size:22px;cursor:pointer;color:var(--muted)">×</button></div>`).join("");
  const done = L.filter(x => x.d).length;
  return `<h3 class="sec">Eigene Artikel</h3><div class="box" style="padding:10px">
   <div style="display:flex;gap:8px"><input id="ex-i" placeholder="z. B. Küchenrolle" autocomplete="off" style="flex:1;min-height:46px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:500 17px inherit;padding:0 12px"><button class="btn pri" data-exadd style="min-width:96px">Hinzufügen</button></div>
   ${sug.length ? `<div class="vor" style="margin-top:8px">${sug.map(s => `<button data-exsug="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
   ${items ? `<div style="margin-top:8px">${items}</div>` : ""}
   ${done ? `<button class="btn" data-exclr style="width:100%;margin-top:8px">Abgehakte entfernen</button>` : ""}
  </div>`;
}
function exAdd(text){
  const t = String(text || "").trim();
  if (!t) { toast("Bitte einen Artikel eintragen"); return false; }
  const L = exList();
  if (L.some(x => String(x.t).toLowerCase() === t.toLowerCase())) { toast("Steht schon auf der Liste"); return false; }
  L.push({ t:t.slice(0, 60), d:false });
  if (L.length > 100) L.shift();
  persist();
  return true;
}
function exRender(focus){
  const y = window.scrollY;
  ui.render();
  window.scrollTo(0, y);
  if (focus) { const i = $("#ex-i"); if (i) i.focus(); }
}

export function nSel(){ return Object.keys(ST.sel).length; }
function shopCore(){
  if (!nSel()) return '<p class="empty">Die Einkaufsliste erscheint, sobald Rezepte im Plan sind.</p>';
  const L = shopList(ST.sel);
  let total = 0, done = 0;
  const secs = CATS.map(c => {
    const it = (L.out[c] || []).filter(x => !hidden(x.key));
    if (!it.length) return "";
    it.forEach(x => { total++; if (ST.sc[x.key]) done++; });
    return `<h3 class="sec">${c}</h3><div class="box">${it.map(x => `<button class="ck" role="checkbox" aria-checked="${!!ST.sc[x.key]}" data-sc="${esc(x.key)}"><i>${ck}</i><span class="l">${esc(x.l)}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span><span class="q">${esc(x.q)}</span></button>`).join("")}</div>`;
  }).join("");
  const vorItems = (L.vor || []).filter(v => !hidden("V|" + v));
  const vor = vorItems.length ? `<h3 class="sec">Zuhause prüfen</h3><div class="vor">${vorItems.map(v => `<button data-sc="V|${esc(v)}" aria-pressed="${!!ST.sc["V|" + v]}">${esc(v)}</button>`).join("")}</div>` : "";
  return `<div class="cnt">${done} von ${total} abgehakt</div>${secs}${vor}
   <p class="note">Packungsgrößen: Hack und Hähnchen in 400 g, Skyr und Quark in 500 g. Dazu kommen Basis-Gewürze (Salz, Pfeffer, Paprika-, Knoblauch-, Zwiebelpulver, Oregano).</p>
   <button class="btn" id="rst" style="width:100%">Haken zurücksetzen</button>`;
}
function doneBar(){
  const n = checkedN();
  if (!n) return "";
  return `<button class="btn" id="scclr" style="width:100%;margin-top:8px">Erledigte löschen (${n})</button>`;
}
function clearDone(){
  ensureMaps();
  const n = checkedN();
  if (!n) { toast("Nichts abgehakt"); return; }
  const snap = {
    sc: JSON.parse(JSON.stringify(ST.sc)),
    sx: JSON.parse(JSON.stringify(ST.sx)),
    extra: JSON.parse(JSON.stringify(ST.extra)),
  };
  Object.keys(ST.sc).forEach(k => { if (ST.sc[k]) { ST.sx[k] = 1; delete ST.sc[k]; } });
  ST.extra = exList().filter(x => !x.d);
  persist();
  const y = window.scrollY; ui.render(); window.scrollTo(0, y);
  toast(n === 1 ? "1 Artikel entfernt" : n + " Artikel entfernt", { label:"Rückgängig", run(){
    ST.sc = snap.sc;
    ST.sx = snap.sx;
    ST.extra = snap.extra;
    persist();
    const y2 = window.scrollY; ui.render(); window.scrollTo(0, y2);
  } });
}
export function shopHtml(){
  applyExpire(Date.now());
  return exHtml() + shopCore() + doneBar() + offersHtml() + manualHtml();
}

export function badges(){
  const bp = $("#bp");
  if (bp) bp.textContent = nSel() || "";
  let open = "";
  if (nSel()) {
    const L = shopList(ST.sel);
    let t = 0, d = 0;
    CATS.forEach(c => (L.out[c] || []).forEach(x => { if (hidden(x.key)) return; t++; if (ST.sc[x.key]) d++; }));
    open = t - d > 0 ? t - d : "";
  }
  const extra = exList().filter(x => !x.d).length;
  const be = $("#be");
  if (be) be.textContent = (parseInt(open, 10) || 0) + extra || "";
}

export function bindShopping(){
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t || ui.tab !== "E") return;
    const d = t.dataset;
    if (t.id === "of-refresh") { refreshOffers(true); return; }
    if (d.ofadd !== undefined) {
      const i = $("#of-i").value.trim();
      if (!i) { toast("Bitte einen Artikel eintragen"); return; }
      ST.offers.push({ i, s:$("#of-s").value, pr:$("#of-p").value.trim(), u:$("#of-u").value || "" });
      if (ST.offers.length > 200) ST.offers.shift();
      persist();
      const y = window.scrollY; ui.render(); window.scrollTo(0, y);
      toast("Angebot gespeichert");
      return;
    }
    if (d.ofx !== undefined) { ST.offers.splice(+d.ofx, 1); persist(); const y = window.scrollY; ui.render(); window.scrollTo(0, y); return; }
    if (d.exadd !== undefined) { const i = $("#ex-i"); if (exAdd(i && i.value)) exRender(true); return; }
    if (d.exsug !== undefined) { if (exAdd(d.exsug)) exRender(false); return; }
    if (d.exck !== undefined) {
      const x = exList()[+d.exck];
      if (x) {
        x.d = !x.d;
        if (x.d) x.at = Date.now(); else delete x.at;
        persist();
        exRender(false);
      }
      return;
    }
    if (d.exdel !== undefined) { exList().splice(+d.exdel, 1); persist(); exRender(false); return; }
    if (d.exclr !== undefined) { ST.extra = exList().filter(x => !x.d); persist(); exRender(false); return; }
    if (t.id === "rst") { exList().forEach(x => { x.d = false; delete x.at; }); persist(); exRender(false); return; }
    if (t.id === "scclr") { clearDone(); return; }
    if (ev.target.id === "no-offers") return;
  });
  document.addEventListener("toggle", ev => {
    if (ev.target && ev.target.id === "no-offers") ui.noOfferOpen = !!ev.target.open;
  }, true);
  setInterval(() => {
    if (ui.tab !== "E") return;
    if (applyExpire(Date.now())) {
      const y = window.scrollY; ui.render(); window.scrollTo(0, y);
    }
  }, 60000);
  document.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && ev.target && ev.target.id === "ex-i") {
      ev.preventDefault();
      if (exAdd(ev.target.value)) exRender(true);
    }
  });
}
