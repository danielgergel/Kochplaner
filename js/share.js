/* Rezepte mit Freundinnen und Freunden teilen. Der Benutzername ist öffentlich, der Schreibschlüssel bleibt auf dem Gerät. */
import { catalog, ST, ui, persist } from "./state.js";
import { $, esc, toast } from "./util.js";
import { showPanel } from "./panels.js";
import { dietOf } from "./diet.js";
import { firebaseReady } from "./sync.js";
import { rebuildAll } from "./recipes.js";

export const USER_RE = /^[a-z0-9_]{3,20}$/;
const TOKEN_RE = /^[a-z0-9]{32}$/;
const PUBLIC_KEYS = ["id", "n", "c", "k", "p", "t", "z", "s", "veg", "note", "gone", "u"];

export function validUsername(s){
  return USER_RE.test(String(s || "").trim());
}

export function shareOnline(){
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function newShareToken(){
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, x => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("").slice(0, 32);
}

export function ensureToken(){
  if (TOKEN_RE.test(ST.shareToken || "")) return ST.shareToken;
  ST.shareToken = newShareToken();
  persist();
  return ST.shareToken;
}

function lines(list, max, each){
  return (Array.isArray(list) ? list : []).map(x => String(x || "").trim()).filter(Boolean).slice(0, max).map(x => x.slice(0, each));
}

export function toPublicRecipe(recipe, veg, now){
  if (!recipe || typeof recipe !== "object") return null;
  const id = String(recipe.id || "");
  const n = String(recipe.n || "").trim().slice(0, 80);
  const z = lines(recipe.z, 40, 160);
  const s = lines(recipe.s, 40, 300);
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(id) || !n || !z.length) return null;
  const out = {
    id, n,
    c: String(recipe.c || "").trim().slice(0, 80),
    k: Math.max(0, Math.min(8000, Math.round(Number(recipe.k) || 0))),
    p: Math.max(0, Math.min(800, Math.round(Number(recipe.p) || 0))),
    t: String(recipe.t || "–").trim().slice(0, 40) || "–",
    z, s: s.length ? s : ["Nach Belieben zubereiten."],
    veg: !!veg,
    gone: false,
    u: now || Date.now(),
  };
  const note = String(recipe.note || "").trim().slice(0, 200);
  if (note) out.note = note;
  return out;
}

export function sanitizeIncoming(raw){
  const pub = toPublicRecipe(raw, !!(raw && raw.veg), raw && raw.u);
  if (!pub) return null;
  if (raw && raw.gone === true) pub.gone = true;
  return pub;
}

export function alreadyImported(cust, username, srcId){
  return (cust || []).some(r => r && r.from === username && r.src === srcId);
}

export function importLocal(pub, username, now){
  const clean = sanitizeIncoming(pub);
  if (!clean || clean.gone || !validUsername(username)) return null;
  const extra = clean.note ? ". " + clean.note : "";
  return {
    id: "X" + String(now || Date.now()),
    n: clean.n,
    c: clean.c || "Hauptmahlzeit (16 Uhr)",
    k: clean.k,
    p: clean.p,
    t: clean.t,
    z: clean.z,
    s: clean.s,
    ns: true,
    pt: "für 2 Personen",
    cust: 1,
    note: ("von " + username + extra).slice(0, 600),
    from: username,
    src: clean.id,
  };
}

export function publicKeysOk(obj){
  return !!obj && Object.keys(obj).every(k => PUBLIC_KEYS.includes(k));
}

function dbApi(){
  const fb = firebaseReady();
  if (!fb || !fb.db || !fb.writeBatch) return null;
  return fb;
}

function needNet(){
  if (!shareOnline()) { toast("Dafür brauchst du Internet."); return false; }
  if (!dbApi()) { toast("Keine Verbindung zum Server. Die App arbeitet lokal weiter."); return false; }
  return true;
}

function shareMap(){
  if (!ST.share || typeof ST.share !== "object" || Array.isArray(ST.share)) ST.share = {};
  return ST.share;
}

function importMap(){
  if (!ST.imports || typeof ST.imports !== "object" || Array.isArray(ST.imports)) ST.imports = {};
  return ST.imports;
}

export function canShareRecipe(id){
  const r = catalog.all[id];
  if (!r) return false;
  if (r.cust) return true;
  return !!(ST.ov && ST.ov[id]);
}

async function writeShare(pub, gone){
  const fb = dbApi();
  const nick = ST.nick;
  const token = ensureToken();
  const u = Date.now();
  const body = Object.assign({}, pub, { gone: !!gone, u });
  const batch = fb.writeBatch(fb.db);
  batch.set(fb.doc(fb.db, "outbox", token, "recipes", pub.id), { username: nick, id: pub.id, u });
  batch.set(fb.doc(fb.db, "shares", nick, "recipes", pub.id), body);
  await batch.commit();
}

export async function publishRecipe(id){
  const r = catalog.all[id];
  if (!r || !validUsername(ST.nick)) return false;
  const pub = toPublicRecipe(r, dietOf(r, ST.diet || {}) === "vegetarisch");
  if (!pub) return false;
  await writeShare(pub, false);
  return true;
}

export async function unpublishRecipe(recipe){
  const pub = toPublicRecipe(recipe, false) || {
    id: recipe.id, n: String(recipe.n || "Rezept").slice(0, 80), c: "", k: 0, p: 0, t: "–",
    z: ["-"], s: ["-"], veg: false, gone: true, u: Date.now(),
  };
  await writeShare(pub, true);
}

export async function claimUsername(raw){
  const name = String(raw || "").trim().toLowerCase();
  if (!validUsername(name)) { toast("Der Name braucht 3 bis 20 Zeichen: Kleinbuchstaben, Ziffern oder _."); return false; }
  if (!needNet()) return false;
  if (name === ST.nick) { toast("Das ist schon dein Name."); return true; }
  const fb = dbApi();
  const token = ensureToken();
  const now = Date.now();
  const old = ST.nick && validUsername(ST.nick) ? ST.nick : "";
  try {
    await fb.runTransaction(fb.db, async tx => {
      const next = fb.doc(fb.db, "profiles", name);
      const snap = await tx.get(next);
      if (snap.exists() && snap.data() && snap.data().released !== true && name !== old) {
        throw new Error("taken");
      }
      const secret = fb.doc(fb.db, "secrets", name);
      if (snap.exists() && snap.data() && snap.data().released === true) {
        tx.update(secret, { token, u: now, released: false });
        tx.update(next, { name, u: now, released: false });
      } else {
        tx.set(secret, { token, u: now, released: false });
        tx.set(next, { name, u: now, released: false });
      }
    });
  } catch (e) {
    if (String(e && e.message) === "taken") toast("Diesen Namen gibt es schon.");
    else toast("Der Name konnte nicht gespeichert werden.");
    return false;
  }
  const previous = old;
  ST.nick = name;
  persist();
  toast("Name gespeichert.");
  if (previous && previous !== name) {
    moveShares(previous, name).then(() => releaseName(previous, token)).catch(() => toast("Der Name gilt. Die alten Rezepte konnten nicht alle umgezogen werden."));
  }
  return true;
}

async function releaseName(name, token){
  const fb = dbApi();
  if (!fb) return;
  const u = Date.now();
  const batch = fb.writeBatch(fb.db);
  batch.update(fb.doc(fb.db, "secrets", name), { token, u, released: true });
  batch.update(fb.doc(fb.db, "profiles", name), { name, u, released: true });
  await batch.commit();
}

async function moveShares(oldName, newName){
  const fb = dbApi();
  if (!fb) return;
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, "shares", oldName, "recipes"), fb.limit(40)));
  const docs = [];
  snap.forEach(d => { const data = d.data(); if (data && data.gone !== true) docs.push(data); });
  for (const data of docs) {
    const pub = sanitizeIncoming(data);
    if (!pub) continue;
    const token = ensureToken();
    const u = Date.now();
    const hide = fb.writeBatch(fb.db);
    hide.set(fb.doc(fb.db, "outbox", token, "recipes", pub.id), { username: oldName, id: pub.id, u });
    hide.set(fb.doc(fb.db, "shares", oldName, "recipes", pub.id), Object.assign({}, pub, { gone: true, u }));
    await hide.commit();
    const u2 = u + 1;
    const show = fb.writeBatch(fb.db);
    show.set(fb.doc(fb.db, "outbox", token, "recipes", pub.id), { username: newName, id: pub.id, u: u2 });
    show.set(fb.doc(fb.db, "shares", newName, "recipes", pub.id), Object.assign({}, pub, { gone: false, u: u2 }));
    await show.commit();
  }
}

export async function toggleShare(id){
  if (!canShareRecipe(id)) { toast("Nur eigene oder bearbeitete Rezepte lassen sich teilen."); return; }
  if (!validUsername(ST.nick || "")) { toast("Lege zuerst einen Benutzernamen in den Einstellungen an."); return; }
  if (!needNet()) return;
  const map = shareMap();
  const on = !map[id];
  try {
    if (on) await publishRecipe(id);
    else await unpublishRecipe(catalog.all[id]);
  } catch (e) {
    toast("Das Rezept konnte nicht übertragen werden.");
    return;
  }
  if (on) map[id] = 1; else delete map[id];
  persist();
  if (ui.openId) ui.redrawDetail();
  toast(on ? "Rezept ist für Freunde sichtbar." : "Rezept ist nicht mehr geteilt.");
}

export async function onRecipeEvent(id, ev){
  if (ev === "toggle") { await toggleShare(id); return; }
  if (ev === "save") {
    if (shareMap()[id] && shareOnline() && firebaseReady()) {
      try { await publishRecipe(id); } catch (e) { toast("Die geteilte Fassung konnte nicht aktualisiert werden."); }
    }
    return;
  }
  if (ev === "delete" || ev === "restore") {
    const rec = catalog.all[id];
    const was = !!shareMap()[id];
    delete shareMap()[id];
    persist();
    if (was && rec && validUsername(ST.nick || "") && shareOnline() && firebaseReady()) {
      try { await unpublishRecipe(rec); } catch (e) {}
    }
  }
}

let friendUser = "";
let friendList = [];
let friendRecipe = null;
let friendHits = [];

function friendShell(body){
  return `<div class="dtop"><div class="in"><button class="back" data-pc>Schließen</button></div></div>
  <div class="dbody"><h2>Freunde</h2>
  <p class="note" style="margin-top:0">Tippe einen Benutzernamen. Du siehst nur Rezepte, die diese Person teilt.</p>
  <input id="fr-q" class="finp" autocapitalize="none" autocomplete="off" maxlength="20" placeholder="Name suchen" value="${esc(friendUser)}">
  ${body}</div>`;
}

function listHtml(){
  if (!friendHits.length) return '<p class="empty">Niemand mit diesem Anfang gefunden.</p>';
  return `<div class="box">${friendHits.map(n => `<button class="ck" data-fu="${esc(n)}" style="grid-template-columns:1fr"><span class="l">${esc(n)}</span></button>`).join("")}</div>`;
}

function recipesOf(user){
  if (!friendList.length) return `<p class="empty">${esc(user)} teilt gerade keine Rezepte.</p>`;
  return `<h3 class="sec">${esc(user)}</h3><div class="box">${friendList.map(r => `<button class="ck" data-fr="${esc(r.id)}" style="grid-template-columns:1fr"><span class="l">${esc(r.n)}${r.veg ? " · v" : ""}</span><small style="color:var(--muted)">${esc(r.k)} kcal · ${esc(r.p)} g</small></button>`).join("")}</div>`;
}

function previewHtml(r){
  const dup = alreadyImported(ST.cust, friendUser, r.id);
  const steps = (r.s || []).map((x, i) => `<p class="note" style="margin:0 0 6px"><b>${i + 1}.</b> ${esc(x)}</p>`).join("");
  return `<button class="btn" data-fback style="margin-bottom:8px">Zurück zur Liste</button>
  <h3 class="sec" style="margin-top:0">${esc(r.n)}${r.veg ? " · v" : ""}</h3>
  <p class="note" style="margin-top:0">${esc(r.c || "")} · ${esc(r.k)} kcal · ${esc(r.p)} g Eiweiß · ${esc(r.t || "")}</p>
  <h3 class="sec">Zutaten</h3><div class="box">${(r.z || []).map(x => `<p class="note" style="margin:0;padding:8px 12px;border-top:1px solid var(--line)">${esc(x)}</p>`).join("")}</div>
  <h3 class="sec">Zubereitung</h3><div class="box" style="padding:12px">${steps}</div>
  ${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}
  <div class="stack"><button class="btn pri" data-fimp ${dup ? "disabled" : ""}>${dup ? "bereits importiert" : "Importieren"}</button></div>`;
}

function drawFriends(body){
  showPanel(friendShell(body));
}

export async function openFriends(){
  friendUser = "";
  friendList = [];
  friendRecipe = null;
  friendHits = [];
  ui.pm = "S";
  drawFriends('<p class="empty">Gib mindestens einen Buchstaben ein.</p>');
}

async function searchUsers(prefix){
  const q = String(prefix || "").trim().toLowerCase();
  friendHits = [];
  if (!q) { drawFriends('<p class="empty">Gib mindestens einen Buchstaben ein.</p>'); return; }
  if (!needNet()) return;
  const fb = dbApi();
  try {
    const snap = await fb.getDocs(fb.query(
      fb.collection(fb.db, "profiles"),
      fb.orderBy(fb.documentId()),
      fb.startAt(q),
      fb.endAt(q + "\uf8ff"),
      fb.limit(10),
    ));
    snap.forEach(d => {
      const data = d.data() || {};
      if (data.released === true) return;
      if (validUsername(d.id)) friendHits.push(d.id);
    });
    drawFriends(listHtml());
  } catch (e) {
    toast("Die Suche ist gerade nicht möglich.");
  }
}

async function loadUser(name){
  if (!validUsername(name) || !needNet()) return;
  friendUser = name;
  friendRecipe = null;
  const fb = dbApi();
  try {
    const snap = await fb.getDocs(fb.query(fb.collection(fb.db, "shares", name, "recipes"), fb.limit(40)));
    friendList = [];
    snap.forEach(d => {
      const clean = sanitizeIncoming(d.data());
      if (clean && !clean.gone) friendList.push(clean);
    });
    friendList.sort((a, b) => a.n.localeCompare(b.n, "de"));
    drawFriends(recipesOf(name));
  } catch (e) {
    toast("Die Rezepte konnten nicht geladen werden.");
  }
}

function showPreview(id){
  const r = friendList.find(x => x.id === id);
  if (!r) return;
  friendRecipe = r;
  drawFriends(previewHtml(r));
}

function doImport(){
  const r = friendRecipe;
  if (!r || !friendUser) return;
  if (alreadyImported(ST.cust, friendUser, r.id)) { toast("bereits importiert"); return; }
  const rec = importLocal(r, friendUser, Date.now());
  if (!rec) { toast("Dieses Rezept lässt sich nicht übernehmen."); return; }
  if (!Array.isArray(ST.cust)) ST.cust = [];
  ST.cust.push(rec);
  importMap()[friendUser + "/" + r.id] = rec.id;
  rebuildAll();
  persist();
  toast("Rezept ist in deinem Buch.");
  drawFriends(previewHtml(r));
}

export function bindShare(){
  document.addEventListener("input", ev => {
    if (!ev.target || ev.target.id !== "fr-q") return;
    const v = ev.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (v !== ev.target.value) ev.target.value = v;
    friendUser = v;
    clearTimeout(bindShare.t);
    bindShare.t = setTimeout(() => searchUsers(v), 300);
  });
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t || ui.pm !== "S") return;
    const d = t.dataset;
    if (d.fu) { loadUser(d.fu); return; }
    if (d.fr) { showPreview(d.fr); return; }
    if (d.fback !== undefined) { friendRecipe = null; drawFriends(recipesOf(friendUser)); return; }
    if (d.fimp !== undefined) { doImport(); return; }
  });
}
