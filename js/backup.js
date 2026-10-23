import { ST, DY, HH, setHH, hsave, replaceState, replaceDiary, SH, storage, SYK } from "./state.js";
import { sanitizeState, sanitizeDiary, sanitizeHousehold } from "./validate.js";
import { rebuildAll } from "./recipes.js";
import { preferLocalDiary, dPush, dStart, startSync, stopSync, adoptDiaryCode, diaryCode } from "./sync.js";
import { toast } from "./util.js";

function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }

export function parseBackup(text){
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error:"Die Datei ist kein gültiges JSON." }; }
  if (!isObj(data)) return { error:"Die Datei hat nicht das erwartete Format." };
  if (data.app === "kochplaner" && isObj(data.state)) {
    const code = typeof data.diaryCode === "string" && /^[a-z0-9]{16,64}$/i.test(data.diaryCode) ? data.diaryCode.toLowerCase() : null;
    return {
      state: sanitizeState(data.state),
      diary: sanitizeDiary(data.diary),
      household: sanitizeHousehold(data.household),
      diaryCode: code,
    };
  }
  if (isObj(data.sel)) return { state:sanitizeState(data), diary:sanitizeDiary(null), household:null, diaryCode:null };
  return { error:"Das ist keine Kochplaner-Sicherung." };
}

function ntext(n, one, many){
  return n + " " + (n === 1 ? one : many);
}
export function summaryOf(data){
  const st = data.state || {};
  const days = Object.keys((data.diary && data.diary.days) || {}).length;
  const recipes = (st.cust || []).length;
  const plan = Object.keys(st.sel || {}).length;
  const bits = [
    ntext(recipes, "eigenes Rezept", "eigene Rezepte"),
    ntext(plan, "Gericht im Plan", "Gerichte im Plan"),
    ntext(days, "Tagebuch-Tag", "Tagebuch-Tage"),
  ];
  if (data.household && data.household.mode === "cloud") bits.push("ein Haushalt-Code");
  if (data.diaryCode) bits.push("ein Tagebuch-Code");
  return bits.join(", ");
}

export function exportBackup(){
  const payload = {
    app: "kochplaner",
    v: 1,
    exportedAt: new Date().toISOString(),
    state: ST,
    diary: DY,
    household: HH,
    diaryCode: null,
  };
  const code = diaryCode();
  if (code) payload.diaryCode = code;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kochplaner-" + payload.exportedAt.slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Sicherungskopie erstellt");
}

function protectHouseholdPush(){
  let last = {};
  try { last = JSON.parse(storage.getItem(SYK) || "{}") || {}; } catch (e) {}
  SH.forEach(k => { if (k !== "aoffers") last[k] = "\u0000import"; });
  try { storage.setItem(SYK, JSON.stringify(last)); } catch (e) {}
}

export function applyBackup(data){
  replaceState(data.state);
  ["cust","offers","stores","wish","extra"].forEach(k => { if (!Array.isArray(ST[k])) ST[k] = []; });
  ["done","fr","sc","sel","rc","week","rate","aoffers"].forEach(k => {
    if (!ST[k] || typeof ST[k] !== "object" || Array.isArray(ST[k])) ST[k] = {};
  });
  if (typeof ST.plz !== "string") ST.plz = "";
  rebuildAll();
  const diary = data.diary || sanitizeDiary(null);
  diary.u = Date.now();
  replaceDiary(diary);
  preferLocalDiary();
  if (data.diaryCode) adoptDiaryCode(data.diaryCode);
  if (data.household) {
    setHH(data.household);
    hsave();
    if (data.household.mode === "cloud") protectHouseholdPush();
    else stopSync();
  } else if (HH && HH.mode === "cloud") protectHouseholdPush();
  startSync();
  dStart();
  dPush(true);
  toast("Sicherung geladen");
}
