/* KI für den Kochplaner. Der Schlüssel GROQ_API_KEY bleibt hier, der Inhalt wird nicht geloggt. */
import { prepFromAi, stepsFromAi } from "../js/ai-recipe.js";

const ORIGIN = "https://danielgergel.github.io";
const MODEL = "openai/gpt-oss-120b";
const MAX_BODY = 12000;
const MAX_TEXT = 8000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 20;
const hits = new Map();

export function corsHeaders(origin){
  const headers = {
    "cache-control": "no-store",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
  };
  if (origin === ORIGIN) headers["access-control-allow-origin"] = ORIGIN;
  return headers;
}

function json(body, status, origin){
  const headers = corsHeaders(origin);
  if (status === 204 || status === 304) return new Response(null, { status, headers });
  headers["content-type"] = "application/json; charset=utf-8";
  return new Response(JSON.stringify(body), { status, headers });
}

function limited(ip){
  const now = Date.now();
  const prev = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (prev.length >= MAX_HITS) {
    hits.set(ip, prev);
    return true;
  }
  prev.push(now);
  hits.set(ip, prev);
  if (hits.size > 500) {
    const first = hits.keys().next().value;
    hits.delete(first);
  }
  return false;
}

async function groq(env, messages){
  const key = env && env.GROQ_API_KEY;
  if (!key) return { error: "nokey" };
  let res;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "authorization": "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { error: "net" };
  }
  if (!res.ok) return { error: "status" };
  let data;
  try { data = await res.json(); } catch (e) { return { error: "json" }; }
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof text !== "string" || text.length > 20000) return { error: "empty" };
  try { return { json: JSON.parse(text) }; } catch (e) { return { error: "parse" }; }
}

const PREP_SYS = "Du strukturierst einen OCR-Rohtext eines Kochrezepts. Antworte nur mit JSON dieser Form: {\"name\":\"\",\"portionen\":2,\"zutaten\":[{\"menge\":\"200\",\"einheit\":\"g\",\"zutat\":\"Hähnchenbrust\"}],\"schritte\":[]}. Menge und Einheit leer lassen, wenn keine Menge dasteht. Schritte nur übernehmen, wenn sie im Text stehen, sonst ein leeres Array. Nichts erfinden. Deutsch und kurz.";
const STEP_SYS = "Du schreibst eine kurze, praxisnahe Zubereitung auf Deutsch für jemanden, der viel High-Protein kocht und oft den Airfryer nutzt. Antworte nur mit JSON: {\"schritte\":[\"...\"]}. Vier bis acht Schritte, jeder ein Satz. Nenne konkrete Temperaturen und Zeiten. Ofen: Grad Celsius und Ober-/Unterhitze oder Umluft. Airfryer: Grad Celsius und Minuten. Pfanne: Stufe und Minuten. Keine Einleitung und keine Nährwerte.";

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/aufbereiten" && path !== "/anleitung") return json({ error: "path" }, 404, origin);
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    if (limited(ip)) return json({ error: "rate" }, 429, origin);
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BODY) return json({ error: "size" }, 413, origin);
    let raw = "";
    try { raw = await request.text(); } catch (e) { return json({ error: "body" }, 400, origin); }
    if (raw.length > MAX_BODY) return json({ error: "size" }, 413, origin);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: "json" }, 400, origin); }
    if (!body || typeof body !== "object") return json({ error: "json" }, 400, origin);

    let messages;
    if (path === "/aufbereiten") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length < 8 || text.length > MAX_TEXT) return json({ error: "size" }, 413, origin);
      messages = [
        { role: "system", content: PREP_SYS },
        { role: "user", content: text },
      ];
    } else {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      const zutaten = Array.isArray(body.zutaten) ? body.zutaten.map(x => String(x || "").trim()).filter(Boolean).slice(0, 40) : [];
      const geraet = body.geraet === "Ofen" || body.geraet === "Pfanne" || body.geraet === "Airfryer" ? body.geraet : "Airfryer";
      if (!name || !zutaten.length) return json({ error: "input" }, 400, origin);
      const packed = zutaten.join("\n");
      if (packed.length > MAX_TEXT) return json({ error: "size" }, 413, origin);
      messages = [
        { role: "system", content: STEP_SYS },
        { role: "user", content: "Rezept: " + name + "\nGerät: " + geraet + "\nZutaten:\n" + packed },
      ];
    }

    const out = await groq(env, messages);
    if (!out || out.error) {
      const status = out && out.error === "nokey" ? 503 : 502;
      return json({ error: "ki" }, status, origin);
    }
    if (path === "/aufbereiten") {
      const clean = prepFromAi(out.json);
      if (!clean) return json({ error: "schema" }, 422, origin);
      return json({ name: clean.n, portionen: clean.portions || null, zutaten: clean.z.map(line => splitLine(line)), schritte: clean.s }, 200, origin);
    }
    const steps = stepsFromAi(out.json);
    if (!steps) return json({ error: "schema" }, 422, origin);
    return json({ schritte: steps }, 200, origin);
  },
};

function splitLine(line){
  const m = String(line).match(/^(\d+(?:[.,]\d+)?)\s+([A-Za-zÄÖÜäöüß.]{1,20})\s+(.+)$/);
  if (!m) return { menge: "", einheit: "", zutat: line };
  return { menge: m[1], einheit: m[2], zutat: m[3] };
}
