import { catalog, ST, HH, ui, persist } from "./state.js";
import { $, toast, dkey } from "./util.js";
import { loadBuiltinRecipes } from "./data/recipes.js";
import { rebuildAll, cleanIds, recipesHtml, listHtml, openRecipe, closeRecipe, redrawDetail, refreshFridge, openFridge, openDice, bindRecipeDom } from "./recipes.js";
import { planHtml, bindPlan } from "./plan.js";
import { shopHtml, badges, bindShopping } from "./shopping.js";
import { drawDy, bindDiary } from "./diary.js";
import { closeScan, bindScanner, warmupScanner } from "./scanner.js";
import { bindOcr } from "./ocr.js";
import { closePanel } from "./panels.js";
import { openHh, bindSettings } from "./settings.js";
import { readHash, wireHooks, initFirebase } from "./sync.js";

catalog.all = loadBuiltinRecipes();
rebuildAll();

function render(){
  cleanIds();
  document.querySelectorAll("#seg button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === ui.tab)));
  $("#app").innerHTML = ui.tab === "R" ? recipesHtml() : ui.tab === "P" ? planHtml() : shopHtml();
  badges();
}

ui.render = render;
ui.redrawDetail = redrawDetail;
ui.refreshFridge = refreshFridge;
ui.drawDy = drawDy;
ui.openHh = openHh;
ui.closePanel = closePanel;
ui.openRecipe = openRecipe;
ui.closeRecipe = closeRecipe;
ui.dyk = dkey(new Date());

const CLRSEL = "#q,#dyq,#qk,#fsr,#wkq,#hh-c,#dc-c";
function enhanceClear(){
  document.querySelectorAll(CLRSEL).forEach(i => {
    if (i.parentElement && i.parentElement.classList.contains("clr")) return;
    const w = document.createElement("span");
    w.className = "clr";
    i.parentNode.insertBefore(w, i);
    w.appendChild(i);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xbtn";
    b.setAttribute("aria-label", "Eingabe löschen");
    b.textContent = "×";
    w.appendChild(b);
  });
}

function bindCore(){
  $("#seg").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-tab]");
    if (!b) return;
    ui.tab = b.dataset.tab;
    render();
    window.scrollTo(0, 0);
  });
  $("#app").addEventListener("input", ev => {
    if (ev.target.id === "q") { ui.fq = ev.target.value; const list = $("#list"); if (list) list.innerHTML = listHtml(); }
  });
  $("#app").addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.g) {
      ui.fg = d.g;
      document.querySelectorAll("#chips button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.g === ui.fg)));
      $("#list").innerHTML = listHtml();
      return;
    }
    if (d.open) { openRecipe(d.open); return; }
    if (d.add) {
      if (ST.sel[d.add]) delete ST.sel[d.add]; else ST.sel[d.add] = 1;
      persist();
      $("#list").innerHTML = listHtml();
      badges();
      return;
    }
    if (d.inc) { ST.sel[d.inc] = Math.min(9, ST.sel[d.inc] + 1); persist(); render(); return; }
    if (d.dec) { if (ST.sel[d.dec] > 1) ST.sel[d.dec]--; else delete ST.sel[d.dec]; persist(); render(); return; }
    if (t.id === "clr") {
      if (t.dataset.c) { ST.sel = {}; ST.rc = {}; persist(); render(); toast("Plan geleert"); }
      else { t.dataset.c = 1; t.textContent = "Wirklich alles entfernen?"; setTimeout(() => { if (t.isConnected) { delete t.dataset.c; t.textContent = "Plan leeren"; } }, 3500); }
      return;
    }
    if (d.sc !== undefined) {
      if (ST.sc[d.sc]) delete ST.sc[d.sc]; else ST.sc[d.sc] = 1;
      persist();
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
      return;
    }
    if (t.id === "rst") { ST.sc = {}; persist(); render(); toast("Haken zurückgesetzt"); }
  });
  $("#bfr").addEventListener("click", () => openFridge());
  $("#bdi").addEventListener("click", () => openDice());
  document.addEventListener("click", ev => {
    const b = ev.target.closest(".xbtn");
    if (!b) return;
    const i = b.previousElementSibling;
    if (!i) return;
    i.value = "";
    i.dispatchEvent(new Event("input", { bubbles:true }));
    i.focus();
  });
  let sx = 0, sy = 0, st = 0, side = 0;
  const top = () => !$("#scn").hidden ? "S" : (!$("#pnl").hidden ? "P" : (ui.openId ? "R" : ""));
  document.addEventListener("touchstart", e => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
    side = sx <= 36 ? 1 : (sx >= window.innerWidth - 36 ? -1 : 0);
  }, { passive:true });
  document.addEventListener("touchend", e => {
    if (!side) return;
    const o = top();
    if (!o) return;
    const t = e.changedTouches[0], dx = (t.clientX - sx) * side, dy = Math.abs(t.clientY - sy);
    side = 0;
    if (dx > 70 && dy < 70 && Date.now() - st < 900) {
      if (o === "S") closeScan();
      else if (o === "P") closePanel();
      else closeRecipe();
    }
  }, { passive:true });
}
readHash();
wireHooks();
bindCore();
bindRecipeDom();
bindPlan();
bindDiary();
bindShopping();
bindScanner();
bindOcr();
bindSettings();
new MutationObserver(enhanceClear).observe(document.body, { childList:true, subtree:true });
enhanceClear();
render();
if (!HH) setTimeout(openHh, 400);
initFirebase();
warmupScanner();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
