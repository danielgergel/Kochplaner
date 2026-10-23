/* Gemeinsamer Zustand. Dieselben localStorage-Schlüssel wie bisher, damit vorhandene Daten weiter gelten. */
const memory = new Map();
function browserStorage(){
  try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch (e) {}
  return {
    getItem: k => memory.has(k) ? memory.get(k) : null,
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: k => memory.delete(k),
  };
}
export const storage = browserStorage();

export const LS = "kochplaner.v1";
export const DLS = "kochplaner.diary.v1";
export const HK = "kochplaner.hh";
export const SYK = "kochplaner.sync.v1";
export const OFFK = "kochplaner.off.v1";
export const DCK = "kochplaner.dc";
export const DSK = "kochplaner.dsync";

export const SH = ["sel","sc","fr","cust","done","offers","week","rate","aoffers","plz","stores","wish","extra","offerUrl"];
export const DFLT = k => (k === "plz" || k === "offerUrl") ? "" : (k === "cust" || k === "offers" || k === "stores" || k === "wish" || k === "extra" ? [] : {});
export const DEFWISH = ["Skyr","Wasser","Rinderhack mager","Tomaten","Erdbeeren","Salat","Gurke","Protein-Joghurt","Wraps","Monster Energy","Red Bull","Tortellini","Reibekäse light","Parmesan","Hähnchen-Minutenschnitzel","Hähnchenbrust","Steak mariniert","Putenschnitzel","Cola Zero","Magerquark","Hüttenkäse","Proteinriegel"];

function readJSON(key){
  try { return JSON.parse(storage.getItem(key)); } catch (e) { return null; }
}

export const ST = { v:1, u:0, sel:{}, sc:{}, rc:{} };
{
  const o = readJSON(LS);
  if (o && o.sel && typeof o.sel === "object") {
    for (const k of Object.keys(ST)) delete ST[k];
    Object.assign(ST, o);
  }
}
if (!Array.isArray(ST.cust)) ST.cust = [];
if (!Array.isArray(ST.offers)) ST.offers = [];
if (!ST.aoffers || typeof ST.aoffers !== "object" || Array.isArray(ST.aoffers)) ST.aoffers = {};
if (!ST.week || typeof ST.week !== "object" || Array.isArray(ST.week)) ST.week = {};
if (!ST.rate || typeof ST.rate !== "object" || Array.isArray(ST.rate)) ST.rate = {};
if (typeof ST.plz !== "string") ST.plz = "";
if (typeof ST.offerUrl !== "string") ST.offerUrl = "";
if (!Array.isArray(ST.stores)) ST.stores = ["REWE","Lidl","Penny"];
if (!Array.isArray(ST.wish)) ST.wish = DEFWISH.slice();
if (!Array.isArray(ST.extra)) ST.extra = [];
if (!ST.rc || typeof ST.rc !== "object" || Array.isArray(ST.rc)) ST.rc = {};
if (!ST.sel || typeof ST.sel !== "object" || Array.isArray(ST.sel)) ST.sel = {};
if (!ST.sc || typeof ST.sc !== "object" || Array.isArray(ST.sc)) ST.sc = {};
if (!ST.fr || typeof ST.fr !== "object" || Array.isArray(ST.fr)) ST.fr = {};
if (!ST.done || typeof ST.done !== "object" || Array.isArray(ST.done)) ST.done = {};

export const DY = { goal:{ k:2100, p:150 }, days:{}, foods:[] };
{
  const o = readJSON(DLS);
  if (o && o.days && typeof o.days === "object") {
    const merged = Object.assign({ goal:{ k:2100, p:150 }, days:{}, foods:[] }, o);
    for (const k of Object.keys(DY)) delete DY[k];
    Object.assign(DY, merged);
  }
}
if (!DY.goal || typeof DY.goal !== "object" || Array.isArray(DY.goal)) DY.goal = { k:2100, p:150 };
if (!(Number(DY.goal.k) > 0)) DY.goal.k = 2100;
if (!(Number(DY.goal.p) > 0)) DY.goal.p = 150;
if (!DY.days || typeof DY.days !== "object") DY.days = {};
if (!Array.isArray(DY.foods)) DY.foods = [];

export let HH = null;
{
  const o = readJSON(HK);
  if (o && typeof o === "object") HH = o;
}
export function setHH(v){ HH = v; }

export const catalog = { all:{}, ALL:[] };

export const ui = {
  tab: "R",
  fq: "",
  fg: "Alle",
  openId: null,
  pm: null,
  fq2: "",
  dg: "Hauptmahlzeit",
  dfr: false,
  dyk: "",
  dyq: "",
  undo: null,
  wkSel: null,
  wkq: "",
  wkg: "Alle",
  foldOpen: {},
  awake: false,
  syncState: "off",
  dState: "off",
  dcShow: false,
  render(){},
  redrawDetail(){},
  refreshFridge(){},
  drawDy(){},
  openHh(){},
  closeRecipe(){},
  closePanel(){},
};

let wt = null;
let persistHook = () => {};
export function setPersistHook(fn){ persistHook = fn; }
export function persist(){
  ST.u = Date.now();
  try { storage.setItem(LS, JSON.stringify(ST)); } catch (e) {}
  clearTimeout(wt);
  wt = setTimeout(() => persistHook(), 700);
}

let diaryHook = null;
export function setDiaryHook(fn){ diaryHook = fn; }
export function dsave(){
  DY.u = Date.now();
  try { storage.setItem(DLS, JSON.stringify(DY)); } catch (e) {}
  if (diaryHook) diaryHook();
}
export function hsave(){
  try { if (HH) storage.setItem(HK, JSON.stringify(HH)); else storage.removeItem(HK); } catch (e) {}
}

export function replaceState(next){
  for (const k of Object.keys(ST)) delete ST[k];
  Object.assign(ST, next);
  try { storage.setItem(LS, JSON.stringify(ST)); } catch (e) {}
}
export function replaceDiary(next){
  for (const k of Object.keys(DY)) delete DY[k];
  Object.assign(DY, next);
  try { storage.setItem(DLS, JSON.stringify(DY)); } catch (e) {}
}
