/* Aufrufe der Kochplaner-KI. Ungeprüftes JSON kommt nicht ins Rezept. */
import { parseRecipeText } from "./ocr-text.js";
import { estimateRecipe } from "./nutrition.js";
import {
  deviceGuess, normalizeDevice, stripSocial, linkOnlyPaste, prepFromAi, stepsFromAi,
  parsedWithAi, nutritionChoice, aiMarks, LINK_HINT,
} from "./ai-check.js";

export {
  deviceGuess, normalizeDevice, stripSocial, linkOnlyPaste, prepFromAi, stepsFromAi,
  parsedWithAi, nutritionChoice, aiMarks, composeAiNote, LINK_HINT,
  AI_NOTE_STEPS, AI_NOTE_ING,
} from "./ai-check.js";

export const AI_BASE = "https://kochplaner-ki.danielgergel.workers.dev";
export const AI_NOTE = "Anleitung von KI erstellt.";

export function aiOnline(){
  return typeof navigator === "undefined" || navigator.onLine !== false;
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

export async function fetchSteps(name, ingredients, device){
  if (!aiOnline()) return null;
  const list = (Array.isArray(ingredients) ? ingredients : []).slice(0, 40).map(x => String(x).slice(0, 120));
  const geraet = normalizeDevice(device, name, list);
  const remote = await postAi("/anleitung", { name: String(name || "").slice(0, 80), zutaten: list, geraet });
  return stepsFromAi(remote);
}

export async function fetchIngredients(name, steps){
  if (!aiOnline()) return null;
  const list = (Array.isArray(steps) ? steps : []).slice(0, 20).map(x => String(x).slice(0, 400));
  if (!list.length) return null;
  const remote = await postAi("/zutaten", { name: String(name || "").slice(0, 80), schritte: list });
  const ai = prepFromAi(remote);
  return ai ? { n: ai.n, z: ai.z, kcal: remote && remote.kcal, eiweiss: remote && remote.eiweiss } : null;
}

export async function adoptRecipeText(text){
  if (linkOnlyPaste(text)) return { linkOnly: true, hint: LINK_HINT, n: "", z: [], s: [], t: "", k: "", p: "", portions: 0, dropped: [], ai: { z: false, s: false, k: false } };
  const cleaned = stripSocial(text);
  const local = parseRecipeText(cleaned);
  let remote = null;
  let parsed = local;
  if (aiOnline()) {
    remote = await postAi("/aufbereiten", { text: cleaned.slice(0, 8000) });
    parsed = parsedWithAi(local, remote, true);
  }
  const marks = aiMarks(local, parsed);
  if (parsed.z.length && !parsed.s.length && aiOnline()) {
    const steps = await fetchSteps(parsed.n || local.n, parsed.z, deviceGuess(parsed.n || local.n, parsed.z));
    if (steps) { parsed = Object.assign({}, parsed, { s: steps }); marks.s = true; }
  }
  if (parsed.s.length && !parsed.z.length && aiOnline()) {
    const ing = await fetchIngredients(parsed.n || local.n, parsed.s);
    if (ing && ing.z.length) {
      parsed = Object.assign({}, parsed, { z: ing.z, n: parsed.n || ing.n });
      marks.z = true;
      if (!remote) remote = {};
      if (ing.kcal != null) remote.kcal = ing.kcal;
      if (ing.eiweiss != null) remote.eiweiss = ing.eiweiss;
    }
  }
  if (!parsed.k || !parsed.p) {
    const nut = nutritionChoice(estimateRecipe(parsed.z || [], parsed.s || []), remote || parsed);
    if (nut) {
      if (!parsed.k && nut.k) parsed.k = nut.k;
      if (!parsed.p && nut.p) parsed.p = nut.p;
      if (nut.from === "ki") marks.k = true;
    }
  }
  parsed.ai = marks;
  parsed.dropped = local.dropped || [];
  parsed.linkOnly = false;
  return parsed;
}
