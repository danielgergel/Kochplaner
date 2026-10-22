import { ST, HH, ui, persist } from "./state.js";
import { $, esc, toast, copyTxt } from "./util.js";
import { showPanel } from "./panels.js";
import { newCode, setHousehold, leaveHousehold, useLocalOnly, hhUrl, diaryCode, diaryCodeVisible, setDiaryCodeVisible, startDiaryBackup, joinDiary, stopDiaryBackup } from "./sync.js";
import { exportBackup, parseBackup, applyBackup, summaryOf } from "./backup.js";
import { rebuildAll } from "./recipes.js";

const APPV = "22.10.2026, Stand 16";
const ALLSTORES = ["REWE","Lidl","Penny","Aldi","Edeka","Kaufland","Netto"];
let pending = null;

function setHtml(){
  const st = ST.stores || [];
  return `<h3 class="sec">Angebote und Einkauf</h3>
  <p class="note" style="margin-top:0">Damit die Wochen-Aufgabe passende Angebote in deiner Nähe findet.</p>
  <div class="frm"><label class="full">Postleitzahl<input id="st-plz" inputmode="numeric" maxlength="5" placeholder="z. B. 76133" value="${esc(ST.plz || "")}"></label>
  <div class="full"><div style="font-size:13px;color:var(--muted);font-weight:600;margin-bottom:6px">Läden, bei denen ihr einkauft</div><div class="ing">${ALLSTORES.map(s => `<button data-stor="${s}" aria-pressed="${st.includes(s)}">${s}</button>`).join("")}</div></div></div>`;
}
function dcHtml(){
  const DC = diaryCode();
  const st = ui.dState === "online" ? "Verbunden, alles gesichert." : ui.dState === "error" ? "Verbindung gestört, wird später gesichert." : "Wird gesichert, sobald eine Verbindung besteht.";
  return `<h3 class="sec">Tagebuch sichern</h3>` + (DC
    ? `<p class="note" style="margin-top:0">Dein Tagebuch wird automatisch in der Cloud gesichert, geschützt durch deinen eigenen Code. ${st}</p>
    <div class="code">${diaryCodeVisible() ? esc(DC) : "••••••••••••••••••••"}</div>
    <div class="stack"><button class="btn" data-dcshow>${diaryCodeVisible() ? "Code verbergen" : "Code anzeigen"}</button><button class="btn" data-dccopy>Code kopieren</button><button class="btn warn" id="dcoff">Sicherung beenden</button></div>
    <p class="note">Schreib dir den Code auf oder mach ein Foto. Ohne ihn kommst du auf einem neuen Handy nicht an dein Tagebuch.</p>`
    : `<p class="note" style="margin-top:0">Bisher liegt dein Tagebuch nur auf diesem Handy. Mit einer Sicherung geht es auch auf einem neuen Handy weiter.</p>
    <div class="stack"><button class="btn pri" data-dcnew>In der Cloud sichern</button></div>
    <input id="dc-c" class="finp" placeholder="Oder Code zum Wiederherstellen einfügen" autocapitalize="none" autocomplete="off" style="margin-top:10px">
    <div class="stack"><button class="btn" data-dcjoin>Wiederherstellen</button></div>`);
}
function backupHtml(){
  const msg = pending
    ? `<p class="bkmsg note">Gefunden: ${esc(summaryOf(pending))}. Das ersetzt die Daten auf diesem Handy.${HH && HH.mode === "cloud" ? " Der verbundene Haushalt bekommt den Plan danach ebenfalls." : ""}</p><div class="stack"><button class="btn pri" data-bkok>Sicherung jetzt laden</button><button class="btn" data-bkno>Abbrechen</button></div>`
    : `<p class="bkmsg note" id="bk-msg"></p>`;
  return `<h3 class="sec">Sicherungskopie</h3>
  <p class="note" style="margin-top:0">Speichert eigene Rezepte, Plan, Einkauf, Kühlschrank, Bewertungen, Wochenplan, Angebote, Einstellungen und das Tagebuch als JSON-Datei.</p>
  <div class="stack"><button class="btn pri" data-bkexp>Alles als JSON exportieren</button>
  <label class="btn" style="display:flex;align-items:center;justify-content:center;cursor:pointer">JSON-Datei einlesen<input id="bk-file" type="file" accept="application/json,.json" style="position:absolute;width:1px;height:1px;opacity:0"></label></div>
  ${msg}`;
}
export function hhHtml(){
  const cloud = HH && HH.mode === "cloud" && HH.code;
  const household = cloud
    ? `<p class="note" style="margin-top:0">Alle, die diesen Code haben, sehen denselben Plan, dieselbe Einkaufsliste, denselben Kühlschrank und dieselben eigenen Rezepte, sofort auf allen Handys. ${window.FB ? (ui.syncState === "online" ? "Verbunden." : ui.syncState === "error" ? "Verbindung gestört, die Änderungen werden später gesendet." : "Verbinde …") : "Keine Verbindung zum Server, die App arbeitet lokal weiter."}</p>
   <div class="code">${esc(HH.code)}</div>
   <div class="stack"><button class="btn pri" data-hhshare>Link teilen</button><button class="btn" data-hhcopy>Code kopieren</button><button class="btn warn" id="hhleave">Haushalt verlassen</button></div>
   <p class="note">Tipp: Deine Freundin öffnet den geteilten Link auf ihrem Handy. Dann ist sie automatisch verbunden. Nur wer den Code kennt, kommt an eure Daten. Das Tagebuch bleibt auf dem jeweiligen Handy.</p>`
    : `<p class="note" style="margin-top:0">Verbinde die App mit deiner Freundin oder deinem Haushalt. Dann seht ihr Plan und Einkaufsliste live auf beiden Handys.</p>
   <div class="stack"><button class="btn pri" data-hhnew>Neuen Haushalt anlegen</button></div>
   <h3 class="sec">Ich habe schon einen Code</h3>
   <input id="hh-c" class="finp" placeholder="Code oder Link einfügen" autocapitalize="none" autocomplete="off">
   <div class="stack"><button class="btn" data-hhjoin>Beitreten</button><button class="btn" data-hhlocal>Nur auf diesem Handy nutzen</button></div>`;
  return `<div class="dtop"><div class="in"><button class="back" data-pc>${HH ? "Schließen" : "Später"}</button></div></div>
  <div class="dbody"><h2>Einstellungen</h2><h3 class="sec" style="margin-top:4px">Haushalt und Teilen</h3>${household}
  ${setHtml()}
  ${dcHtml()}
  <h3 class="sec">Datenquellen</h3><p class="note" style="margin-top:0">Gescannte Produkte: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL). Die Werte beim Schnell-Eintragen sind Durchschnittswerte und können abweichen.</p>
  ${backupHtml()}
  <h3 class="sec">App</h3><p class="note" style="margin-top:0">Version ${APPV}</p><div class="stack"><button class="btn" data-reload>Neu laden</button></div>
  </div>`;
}
export function openHh(){
  ui.pm = "H";
  showPanel(hhHtml());
}

export function bindSettings(){
  document.addEventListener("input", ev => {
    if (ev.target.id === "st-plz") {
      const v = ev.target.value.replace(/\D/g, "").slice(0, 5);
      if (v !== ev.target.value) ev.target.value = v;
      ST.plz = v;
      persist();
    }
    if (ev.target.id === "st-wish") {
      ST.wish = ev.target.value.split("\n").map(x => x.trim()).filter(Boolean);
      persist();
    }
  });
  document.addEventListener("change", ev => {
    if (!ev.target || ev.target.id !== "bk-file" || !ev.target.files || !ev.target.files[0]) return;
    const file = ev.target.files[0];
    file.text().then(text => {
      const data = parseBackup(text);
      if (data.error) { pending = null; toast(data.error); openHh(); return; }
      pending = data;
      openHh();
    }).catch(() => toast("Die Datei konnte nicht gelesen werden."));
    ev.target.value = "";
  });
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (t.id === "bhh") { pending = null; openHh(); return; }
    if (d.reload !== undefined) { location.reload(); return; }
    if (ui.pm !== "H" || document.querySelector("#pnl").hidden) return;
    if (d.hhnew !== undefined) { setHousehold(newCode(), false); return; }
    if (d.hhjoin !== undefined) {
      const m = ($("#hh-c") || { value:"" }).value.match(/([a-z0-9]{16,64})\s*$/i);
      if (!m) { toast("Das ist kein gültiger Code"); return; }
      setHousehold(m[1].toLowerCase(), true);
      return;
    }
    if (d.hhlocal !== undefined) { useLocalOnly(); return; }
    if (d.hhshare !== undefined) {
      const u = hhUrl();
      if (navigator.share) navigator.share({ title:"Kochplaner", text:"Unser gemeinsamer Kochplaner:", url:u }).catch(() => {});
      else copyTxt(u);
      return;
    }
    if (d.hhcopy !== undefined) { copyTxt(HH.code); return; }
    if (t.id === "hhleave") {
      if (t.dataset.c) leaveHousehold();
      else { t.dataset.c = 1; t.textContent = "Wirklich verlassen?"; setTimeout(() => { if (t.isConnected) { delete t.dataset.c; t.textContent = "Haushalt verlassen"; } }, 3500); }
      return;
    }
    if (d.dcnew !== undefined) { startDiaryBackup(); return; }
    if (d.dcjoin !== undefined) {
      const m = ($("#dc-c") || { value:"" }).value.match(/([a-z0-9]{16,64})\s*$/i);
      if (!m) { toast("Das ist kein gültiger Code"); return; }
      joinDiary(m[1].toLowerCase());
      return;
    }
    if (d.dcshow !== undefined) { setDiaryCodeVisible(!diaryCodeVisible()); openHh(); return; }
    if (d.dccopy !== undefined) { copyTxt(diaryCode()); return; }
    if (t.id === "dcoff") {
      if (t.dataset.c) stopDiaryBackup();
      else { t.dataset.c = 1; t.textContent = "Wirklich beenden?"; setTimeout(() => { if (t.isConnected) { delete t.dataset.c; t.textContent = "Sicherung beenden"; } }, 3500); }
      return;
    }
    if (d.stor) {
      const s = d.stor, a = ST.stores || (ST.stores = []), i = a.indexOf(s);
      if (i >= 0) a.splice(i, 1); else a.push(s);
      persist();
      t.setAttribute("aria-pressed", String(i < 0));
      return;
    }
    if (d.bkexp !== undefined) { exportBackup(); return; }
    if (d.bkno !== undefined) { pending = null; openHh(); return; }
    if (d.bkok !== undefined && pending) {
      const data = pending;
      pending = null;
      applyBackup(data);
      rebuildAll();
      ui.closePanel();
      ui.render();
    }
  });
}
