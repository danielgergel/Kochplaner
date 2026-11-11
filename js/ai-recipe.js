/* Prüfung der KI-Antworten und die Aufrufe. Ungeprüftes JSON kommt nicht ins Rezept. */
import { parseRecipeText } from "./ocr-text.js";
import { dishesFromAi } from "./dish-ai.js";

export const AI_BASE = "https://kochplaner-ki.danielgergel.workers.dev";
export const AI_NOTE = "Anleitung von KI erstellt.";

const DEVICES = new Set(["Airfryer", "Ofen", "Pfanne"]);

export function aiOnline(){
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function deviceGuess(name, ingredients){
  const t = (String(name || "") + " " + (Array.isArray(ingredients) ? ingredients.join(" ") : String(ingredients || ""))).toLowerCase();
  if (/airfryer|heissluft|heißluft/.test(t)) return "Airfryer";
  if (/ofen|umluft|ober\/unterhitze/.test(t)) return "Ofen";
  if (/pfanne|anbraten|braten/.test(t)) return "Pfanne";
  return "Airfryer";
}

function clip(v, max){
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function prepFromAi(data){
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const name = clip(data.name, 80);
  let portionen = Number(data.portionen);
  if (!Number.isFinite(portionen) || portionen < 1 || portionen > 24) portionen = 0;
  else portionen = Math.round(portionen);
  if (!Array.isArray(data.zutaten) || !data.zutaten.length || data.zutaten.length > 40) return null;
  const z = [];
  for (const row of data.zutaten) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.zutat !== "string" || row.zutat.trim().length < 2 || row.zutat.trim().length > 80) continue;
    if (typeof row.menge === "string" && row.menge.trim().length > 20) continue;
    if (typeof row.einheit === "string" && row.einheit.trim().length > 20) continue;
    const zutat = row.zutat.trim();
    const menge = typeof row.menge === "number" && Number.isFinite(row.menge)
      ? String(row.menge).replace(".", ",").slice(0, 20)
      : clip(row.menge, 20);
    const einheit = clip(row.einheit, 20);
    const line = [menge, einheit, zutat].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (line.length > 120) continue;
    z.push(line);
  }
  if (!z.length) return null;
  const s = [];
  if (Array.isArray(data.schritte)) {
    for (const step of data.schritte.slice(0, 20)) {
      const t = clip(step, 400);
      if (t.length >= 8) s.push(t);
    }
  }
  return { n: name, z, s, portions: portionen };
}

export function stepsFromAi(data){
  if (!data || typeof data !== "object" || !Array.isArray(data.schritte)) return null;
  const s = [];
  for (const step of data.schritte.slice(0, 12)) {
    const t = clip(step, 400);
    if (t.length < 12) continue;
    s.push(t);
  }
  if (s.length < 2) return null;
  const blob = s.join(" ");
  if (!/\d+\s*°/.test(blob) || !/\d+\s*min/i.test(blob)) return null;
  return s;
}

export function parsedWithAi(local, remote, online){
  if (!online) return local;
  const ai = prepFromAi(remote);
  if (!ai) return local;
  return {
    n: ai.n || local.n,
    z: ai.z,
    s: ai.s.length ? ai.s : local.s,
    t: local.t,
    k: local.k,
    p: local.p,
    portions: ai.portions || local.portions,
    dropped: local.dropped || [],
  };
}

async function postAi(path, body){
  if (!aiOnline()) return null;
  try {
    const res = await fetch(AI_BASE + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function adoptRecipeText(text){
  const local = parseRecipeText(text);
  if (!aiOnline()) return local;
  const remote = await postAi("/aufbereiten", { text: String(text || "").slice(0, 8000) });
  return parsedWithAi(local, remote, true);
}

const IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i;
export const BILD_MAX = 4 * 1024 * 1024;
export const BILD_COUNT = 3;

export function visionImages(list){
  if (!Array.isArray(list) || list.length < 1 || list.length > BILD_COUNT) return null;
  const urls = [];
  let total = 0;
  for (const raw of list) {
    if (typeof raw !== "string") return null;
    const url = raw.replace(/\s/g, "");
    if (!IMAGE_RE.test(url)) return null;
    total += url.length;
    if (total > BILD_MAX) return null;
    urls.push(url);
  }
  return urls;
}

export function screenshotRoute(visionOk){
  return visionOk ? "bild" : "ocr";
}

export async function fetchBild(urls){
  if (!aiOnline()) return null;
  const images = visionImages(urls);
  if (!images) return null;
  const remote = await postAi("/bild", { bilder: images });
  return prepFromAi(remote);
}

export async function fetchSteps(name, ingredients, device){
  if (!aiOnline()) return null;
  const list = (Array.isArray(ingredients) ? ingredients : []).slice(0, 40).map(x => String(x).slice(0, 120));
  const geraet = DEVICES.has(device) ? device : deviceGuess(name, list);
  const remote = await postAi("/anleitung", { name: String(name || "").slice(0, 80), zutaten: list, geraet });
  return stepsFromAi(remote);
}

/* Mahlzeit schätzen: Text -> Zutaten mit Gramm, kcal, Eiweiß. Geprüft wird hier und im Worker. */
export const MEAL_MAX = 1000;
const cleanName = v => (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
function numIn(v, min, max){
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
export function mealFromAi(data){
  if (!data || typeof data !== "object" || !Array.isArray(data.zutaten)) return null;
  const out = [];
  for (const row of data.zutaten.slice(0, 12)) {
    if (!row || typeof row !== "object") continue;
    const n = cleanName(row.name), g = numIn(row.gramm, 1, 3000), k = numIn(row.kcal, 0, 5000), p = numIn(row.eiweiss, 0, 300);
    if (n.length < 2 || g == null || k == null || p == null) continue;
    out.push({ n, g: Math.round(g * 10) / 10, k: Math.round(k), p: Math.round(p * 10) / 10 });
  }
  return out.length ? out : null;
}
export async function fetchDishes(text){
  if (!aiOnline()) return null;
  const q = String(text || "").trim().slice(0, 80);
  if (q.length < 3) return null;
  const remote = await postAi("/vorschlaege", { text: q });
  return dishesFromAi(remote);
}

export async function fetchMeal(text, known){
  if (!aiOnline()) return null;
  const t = String(text || "").trim().slice(0, MEAL_MAX);
  if (!t) return null;
  const bekannt = (Array.isArray(known) ? known : []).slice(0, 12).map(x => ({ n: String(x.n || "").slice(0, 60), k: Number(x.k), p: Number(x.p) })).filter(x => x.n && Number.isFinite(x.k) && Number.isFinite(x.p));
  const remote = await postAi("/schaetzen", { text: t, bekannt });
  return mealFromAi(remote);
}
