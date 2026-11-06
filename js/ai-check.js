/* Reine Prüfungen für KI-Antworten. Kein Netzwerk, keine Lebensmittelliste. */

export const AI_NOTE_STEPS = "Anleitung von KI erstellt.";
export const AI_NOTE_ING = "Zutatenmengen von KI geschätzt.";
export const LINK_HINT = "Bitte die Beschreibung des Videos kopieren und hier einfügen.";

const DEVICES = new Set(["Airfryer", "Ofen", "Pfanne"]);

export function deviceGuess(name, ingredients){
  const t = (String(name || "") + " " + (Array.isArray(ingredients) ? ingredients.join(" ") : String(ingredients || ""))).toLowerCase();
  if (/airfryer|heissluft|heißluft/.test(t)) return "Airfryer";
  if (/ofen|umluft|ober\/unterhitze/.test(t)) return "Ofen";
  if (/pfanne|anbraten|braten/.test(t)) return "Pfanne";
  return "Airfryer";
}

export function normalizeDevice(device, name, ingredients){
  return DEVICES.has(device) ? device : deviceGuess(name, ingredients);
}

/** Hashtags, Emojis, Links und Werbezeilen aus einer Bildunterschrift nehmen. */
export function stripSocial(text){
  let t = String(text || "");
  t = t.replace(/https?:\/\/\S+/gi, " ");
  t = t.replace(/#[\p{L}\p{N}_]+/gu, " ");
  t = t.replace(/@[\p{L}\p{N}_.]+/gu, " ");
  t = t.replace(/\p{Extended_Pictographic}/gu, " ");
  t = t.replace(/[\uFE0F\u200D]/g, "");
  t = t.split(/\r?\n/).filter(line => !/^\s*(folge mir|link in (der )?bio|werbung|anzeige|sponsored|unbezahlte werbung|rabattcode|gutscheincode|jetzt shoppen|code\s*[:：])/i.test(line)).join("\n");
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function linkOnlyPaste(text){
  const t = String(text || "").trim();
  if (!/https?:\/\//i.test(t)) return false;
  const rest = stripSocial(t).replace(/[^0-9A-Za-zÄÖÜäöüß]/g, "");
  return rest.length < 12;
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
      const line = clip(step, 400);
      if (line.length >= 8) s.push(line);
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

function bounded(v, max){
  const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
}

/** Lokale Nährwerte gewinnen, sobald eine Zutat in der Lebensmittelliste liegt. */
export function nutritionChoice(local, ai){
  if (local && Number(local.found) > 0 && (Number(local.k) > 0 || Number(local.p) > 0)) {
    return { k: String(local.k), p: String(local.p), from: "local" };
  }
  const k = bounded(ai && (ai.kcal != null ? ai.kcal : ai.k), 4000);
  const p = bounded(ai && (ai.eiweiss != null ? ai.eiweiss : ai.p), 300);
  if (k == null && p == null) return null;
  return { k: k == null ? "" : String(k), p: p == null ? "" : String(p), from: "ki" };
}

export function composeAiNote(prev, flags){
  const bits = [];
  if (flags && flags.steps) bits.push(AI_NOTE_STEPS);
  if (flags && flags.ingredients) bits.push(AI_NOTE_ING);
  let text = String(prev || "").trim();
  for (const bit of bits) {
    const key = bit.replace(/\.$/, "");
    if (!text.includes(key)) text = text ? text.replace(/\s*$/, "") + " " + bit : bit;
  }
  return text;
}

export function aiMarks(local, next){
  const lz = (local && local.z) || [];
  const ls = (local && local.s) || [];
  const nz = (next && next.z) || [];
  const ns = (next && next.s) || [];
  return {
    z: nz.length > 0 && nz.join("\n") !== lz.join("\n"),
    s: ns.length > 0 && ns.join("\n") !== ls.join("\n"),
    k: false,
  };
}
