import { ST, ui, persist } from "./state.js";
import { $, esc, toast, ck, dkey, nm, stripPl } from "./util.js";
import { CATS, shopList } from "./shopcalc.js";

const STORES = ["REWE","Lidl","Aldi","Edeka","Kaufland","Penny","Netto","Anderer"];
const OSTOP = new Set(["light","protein","high","frisch","frische","bio","pack","dose","roh","block","beutel","mager","nach","bedarf","stueck"]);
const OSYN = [[/toastbrot|sandwich ?brot/g,"toast"],[/passata|tomatensauce|tomatensosse/g,"passierte tomaten"],[/spaghetti|penne|fusilli|tagliatelle|rigatoni|makkaroni|farfalle/g,"nudeln"],[/mandelmilch/g,"mandeldrink"]];
const OBAD = /\b(milchreis|buttermilch|muellermilch|milchschnitte|kokosmilch|dessert|eierlikoer|eiernudeln?|erdnussbutter|butterkeks|kartoffelsalat|nudelsalat|wurstsalat|heringssalat|fleischsalat|eiersalat|tomatenmark|ketchup|thunfisch|hering|suppe|sauce|pesto|chips|waffeln|spielzeug)\b|muellermilch/;
const okDate = u => typeof u === "string" && /^\d{4}-\d{2}-\d{2}$/.test(u);
const autoItems = () => (ST.aoffers && Array.isArray(ST.aoffers.items)) ? ST.aoffers.items : [];
const isLive = (o, today) => !!(o && o.i && o.s && (!okDate(o.u) || o.u >= today));
const autoN = () => { const t = dkey(new Date()); return autoItems().filter(o => isLive(o, t)).length; };
const normStore = s => {
  const t = nm(s);
  if (/^(e ?center|edeka)/.test(t)) return "Edeka";
  for (const x of STORES) { if (x !== "Anderer" && t.indexOf(nm(x)) === 0) return x; }
  return String(s).trim();
};
const prNum = p => { const m = String(p == null ? "" : p).replace(",", ".").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : Infinity; };
const oParts = l => String(l).split(/[\/()]/).map(nm).filter(Boolean);

function oScoreOne(a, b){
  const bad = a.match(OBAD);
  if (bad && b.indexOf(bad[1] || bad[0]) < 0) return 0;
  const aw = a.split(" "), cw = b.split(" ").filter(w => w.length >= 4 && !OSTOP.has(w));
  if (!cw.length) return 0;
  let hit = 0;
  cw.forEach(x => {
    if (aw.some(w => w.length >= 3 && (w === x || stripPl(w) === stripPl(x) || (Math.min(w.length, x.length) >= 6 && (w.startsWith(x) || x.startsWith(w))) || (x.length >= 5 && x !== "milch" && w.endsWith(x))))) hit++;
  });
  const need = cw.length <= 2 ? cw.length : Math.ceil(cw.length / 2);
  return hit >= need ? hit / cw.length + (a.indexOf(b) >= 0 ? 1 : 0) + b.length / 1000 : 0;
}
function oScore(offer, label){
  let a = nm(offer);
  if (!a) return 0;
  OSYN.forEach(r => { a = a.replace(r[0], r[1]); });
  return oParts(label).reduce((m, p) => Math.max(m, oScoreOne(a, p)), 0);
}
function offersCompare(){
  const L = shopList(ST.sel), labels = [];
  CATS.forEach(c => L.out[c].forEach(x => { if (labels.indexOf(x.l) < 0) labels.push(x.l); }));
  const today = dkey(new Date()), live = (ST.offers || []).concat(autoItems()).filter(o => isLive(o, today)), by = {};
  live.forEach(o => {
    let m = null, best = 0;
    labels.forEach(l => { const s = oScore(o.i, l); if (s > best) { best = s; m = l; } });
    if (!m) return;
    const st = normStore(o.s), b = by[st] || (by[st] = {});
    if (!b[m] || prNum(o.pr) < prNum(b[m].pr)) b[m] = o;
  });
  const rows = Object.keys(by).map(s => ({ s, items:Object.keys(by[s]).map(l => ({ l, o:by[s][l] })) })).sort((a, b) => b.items.length - a.items.length);
  return { rows, total:labels.length, live:live.length };
}
const ofDate = u => { if (!okDate(u)) return ""; const [a, b, c] = u.split("-"); return " bis " + c + "." + b + "."; };
function autoInfo(){
  if (!autoN()) return '<p class="note" style="margin:8px 0 0">Automatisch geholte Angebote erscheinen hier, sobald die Wochen-Aufgabe sie in euren Haushalt geschrieben hat.</p>';
  const at = okDate(ST.aoffers.at) ? (() => { const [y, m, d] = ST.aoffers.at.split("-"); return d + "." + m + "."; })() : "";
  return `<p class="note" style="margin:8px 0 0">${autoN()} Angebote automatisch geholt${at ? " (Stand " + at + ")" : ""}. Die Angaben sind nicht immer vollständig, bitte vor dem Einkauf kurz prüfen.</p>`;
}
function offersHtml(){
  const C = offersCompare(), today = dkey(new Date());
  const res = !(ST.offers.length || autoN()) ? '<p class="empty" style="padding:6px 0">Noch keine Angebote eingetragen. Schau in die Prospekte und trag ein, was dich interessiert.</p>'
    : !C.total ? '<p class="empty" style="padding:6px 0">Wähle Rezepte im Plan, dann siehst du, welcher Laden für deine Liste am meisten bietet.</p>'
    : !C.rows.length ? '<p class="empty" style="padding:6px 0">Keine eingetragenen Angebote passen zu deiner Einkaufsliste.</p>'
    : C.rows.map((r, i) => `<div class="ofr${i === 0 ? " best" : ""}"><b>${i === 0 ? "Meiste Treffer: " : ""}${esc(r.s)}</b><span class="meta" style="display:block">${r.items.length} von ${C.total} Artikeln im Angebot</span>${r.items.map(x => `<span class="meta" style="display:block">${esc(x.l)}: ${esc(x.o.pr || "Angebot")}${x.o.pr && !/€/.test(x.o.pr) ? " €" : ""}${ofDate(x.o.u)}<small style="display:block;opacity:.7">${esc(x.o.i)}</small></span>`).join("")}</div>`).join("");
  const links = `<a class="btn pri" style="display:flex;align-items:center;justify-content:center;text-decoration:none;width:100%" href="https://www.kaufda.de/" target="_blank" rel="noopener">Alle Angebote in kaufDA ansehen</a><a class="chipb" href="https://www.marktguru.de/" target="_blank" rel="noopener" style="margin-top:6px">Alternative: marktguru</a>`;
  const list = ST.offers.map((o, i) => `<div class="ent"><b>${esc(o.i)}</b><span class="meta">${esc(o.s)} · ${esc(o.pr || "")}${o.pr && !/€/.test(o.pr) ? " €" : ""}${ofDate(o.u)}${o.u && o.u < today ? " · abgelaufen" : ""}</span><div class="eac"><button data-ofx="${i}" aria-label="Angebot löschen">×</button></div></div>`).join("");
  return `<h3 class="sec">Angebote vergleichen</h3>
  <div class="box" style="padding:12px">
   <div id="ofres">${res}</div>${autoInfo()}
   <p class="note" style="margin:10px 0 6px">Die Wochen-Aufgabe holt die Angebote dienstags und donnerstags abends. Eigene Funde kannst du unten eintragen oder direkt im Prospekt nachsehen.</p>
   <div class="alts" style="margin-top:0">${links}</div>
  </div>
  <h3 class="sec">Angebot eintragen</h3>
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
    const it = L.out[c];
    if (!it.length) return "";
    it.forEach(x => { total++; if (ST.sc[x.key]) done++; });
    return `<h3 class="sec">${c}</h3><div class="box">${it.map(x => `<button class="ck" role="checkbox" aria-checked="${!!ST.sc[x.key]}" data-sc="${esc(x.key)}"><i>${ck}</i><span class="l">${esc(x.l)}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span><span class="q">${esc(x.q)}</span></button>`).join("")}</div>`;
  }).join("");
  const vor = L.vor.length ? `<h3 class="sec">Zuhause prüfen</h3><div class="vor">${L.vor.map(v => `<button data-sc="V|${esc(v)}" aria-pressed="${!!ST.sc["V|" + v]}">${esc(v)}</button>`).join("")}</div>` : "";
  return `<div class="cnt">${done} von ${total} abgehakt</div>${secs}${vor}
   <p class="note">Packungsgrößen: Hack und Hähnchen in 400 g, Skyr und Quark in 500 g. Dazu kommen Basis-Gewürze (Salz, Pfeffer, Paprika-, Knoblauch-, Zwiebelpulver, Oregano).</p>
   <button class="btn" id="rst" style="width:100%">Haken zurücksetzen</button>`;
}
export function shopHtml(){ return exHtml() + shopCore() + offersHtml(); }

export function badges(){
  const bp = $("#bp");
  if (bp) bp.textContent = nSel() || "";
  let open = "";
  if (nSel()) {
    const L = shopList(ST.sel);
    let t = 0, d = 0;
    CATS.forEach(c => L.out[c].forEach(x => { t++; if (ST.sc[x.key]) d++; }));
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
    if (d.exck !== undefined) { const x = exList()[+d.exck]; if (x) { x.d = !x.d; persist(); exRender(false); } return; }
    if (d.exdel !== undefined) { exList().splice(+d.exdel, 1); persist(); exRender(false); return; }
    if (d.exclr !== undefined) { ST.extra = exList().filter(x => !x.d); persist(); exRender(false); return; }
    if (t.id === "rst") { exList().forEach(x => { x.d = false; }); persist(); exRender(false); }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && ev.target && ev.target.id === "ex-i") {
      ev.preventDefault();
      if (exAdd(ev.target.value)) exRender(true);
    }
  });
}
