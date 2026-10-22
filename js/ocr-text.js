/* Nachbearbeitung für die Texterkennung: Einheiten glätten und unleserliche Zeilen verwerfen. */
const UNITS = new Set("el tl g kg mg ml l stk stück stueck tk pk nb cm msp cl dl prise prisen bund dose scheibe scheiben zehe zehen".split(" "));
const ROWS = ["qwertzuiopü", "asdfghjklöä", "yxcvbnm"];

export function isKeySmash(word){
  const w = String(word).toLowerCase().replace(/[^a-zäöüß]/g, "");
  if (w.length < 4) return false;
  for (const row of ROWS) {
    let run = 1;
    for (let i = 1; i < w.length; i++) {
      const a = row.indexOf(w[i - 1]), b = row.indexOf(w[i]);
      if (a >= 0 && b >= 0 && Math.abs(a - b) <= 1) run++;
      else run = 1;
      if (run >= 4) return true;
    }
  }
  return false;
}

function vowels(s){
  const t = String(s).toLowerCase().replace(/[^a-zäöü]/g, "");
  if (!t.length) return 0;
  return (t.match(/[aeiouyäöü]/g) || []).length / t.length;
}

export function suspiciousToken(raw){
  const t = String(raw || "").trim();
  if (!t) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return false;
  if (/^[½¼¾]$/.test(t)) return false;
  const bare = t.replace(/[.,;:!?()]+$/g, "").replace(/^[.,;:!?()]+/g, "");
  const low = bare.toLowerCase();
  if (UNITS.has(low)) return false;
  if (bare.length <= 1) return true;
  if (/[^A-Za-zÄÖÜäöüß0-9\-–]/.test(bare)) return true;
  if (isKeySmash(bare)) return true;
  if (/^[A-ZÄÖÜ]{3,}$/.test(bare)) return true;
  if (bare.length >= 3 && vowels(bare) < 0.2) return true;
  if (/[bcdfghjklmnpqrstvwxyzß]{5,}/i.test(bare) && vowels(bare) < 0.34) return true;
  if (/[a-zäöü][A-ZÄÖÜ]/.test(bare)) return true;
  return false;
}

export function looksLikeIngredient(line){
  return /^(\d|½|¼|¾)/.test(line)
    || /^(ein|eine|einen|etwas|je|prise|n\.?\s*b\.|nach geschmack)\b/i.test(line)
    || /\b(\d+\s*)?(el|tl|stück|stk|prise|bund|dose|scheibe|zehe)\b/i.test(line);
}

export function normalizeAmount(s){
  let t = String(s).replace(/[|¦]/g, " ").replace(/[“”„"'`´]/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^[lI|]\s+(?=(?:EL|TL|g|kg|ml|Liter|Gramm)\b)/i, "1 ");
  t = t.replace(/\b(esslöffel|essloeffel)\b/gi, "EL");
  t = t.replace(/\b(teelöffel|teeloeffel)\b/gi, "TL");
  t = t.replace(/\bgramm\b/gi, "g");
  t = t.replace(/(\d)\s*[,.]\s*(\d)/g, "$1,$2");
  t = t.replace(/(\d+(?:,\d+)?)\s*(g|kg|mg|ml|el|tl|stk)\b/gi, (_, n, u) => {
    const U = /^(el|tl)$/i.test(u) ? u.toUpperCase() : u.toLowerCase();
    return n + " " + U;
  });
  t = t.replace(/(\d+(?:,\d+)?)(?=[A-Za-zÄÖÜäöü])/g, "$1 ");
  return t.replace(/\s+/g, " ").trim();
}

function looksUseful(line){
  if (looksLikeIngredient(line)) return true;
  if (/^(zutaten|das brauchst du|du brauchst|einkaufsliste|ingredients|zubereitung|so gehts|anleitung|schritte|nährwerte|naehrwerte|macros)\b/i.test(line)) return true;
  if (vowels(line) < 0.25) return false;
  if (line.length < 8) return false;
  return true;
}

/* Gibt die bereinigte Zeile zurück oder null, wenn sie Müll ist. */
export function cleanLine(raw){
  const norm = normalizeAmount(raw);
  if (!norm) return null;
  const kept = [];
  for (const p of norm.split(/\s+/)) {
    if (suspiciousToken(p)) continue;
    const piece = p.replace(/^[,;]+|[,;]+$/g, "");
    if (piece) kept.push(piece);
  }
  const line = kept.join(" ").replace(/\s+/g, " ").trim();
  if (line.length < 2) return null;
  const words = line.split(/\s+/);
  const bad = words.filter(suspiciousToken).length;
  if (words.length && bad / words.length > 0.5) return null;
  if (!looksUseful(line)) return null;
  return line;
}

export function textFromRecognition(data){
  const lines = data && Array.isArray(data.lines) ? data.lines : null;
  const kept = [];
  const dropped = [];
  const pushDrop = s => { const t = String(s || "").replace(/\s+/g, " ").trim(); if (t) dropped.push(t); };
  if (!lines || !lines.length) {
    String(data && data.text || "").split(/\r?\n/).forEach(l => {
      const c = cleanLine(l);
      if (c) kept.push(c); else if (String(l).trim()) pushDrop(l);
    });
    return { lines: kept, dropped, text: kept.join("\n") };
  }
  for (const line of lines) {
    const words = Array.isArray(line.words) ? line.words : [];
    let text = "";
    if (words.length) {
      const good = words.filter(w => w && String(w.text || "").trim() && (Number(w.confidence) || 0) >= 40);
      const avg = good.length ? good.reduce((a, w) => a + (Number(w.confidence) || 0), 0) / good.length : 0;
      text = good.map(w => String(w.text).trim()).join(" ");
      if (!good.length || (avg < 45 && !looksLikeIngredient(normalizeAmount(text)))) {
        pushDrop(line.text || text);
        continue;
      }
    } else {
      text = String(line.text || "");
      const conf = Number(line.confidence);
      if (Number.isFinite(conf) && conf < 40 && !looksLikeIngredient(normalizeAmount(text))) {
        pushDrop(text);
        continue;
      }
    }
    const cleaned = cleanLine(text);
    if (cleaned) kept.push(cleaned);
    else pushDrop(text || line.text);
  }
  return { lines: kept, dropped, text: kept.join("\n") };
}

const IMPNL = "\n";
function impFmt(v, u){
  let r;
  if (/^(g|ml|gramm)\b/i.test(u)) r = Math.max(1, Math.round(v));
  else if (/^(kg|l|liter)\b/i.test(u)) r = Math.round(v * 100) / 100;
  else r = Math.max(0.5, Math.round(v * 2) / 2);
  return String(r).replace(".", ",");
}
function impScale(line, factor){
  const m = line.match(/^(\d+(?:[.,]\d+)?|½|¼|¾)(\s*)(.*)$/);
  if (!m) return line;
  const base = m[1] === "½" ? 0.5 : m[1] === "¼" ? 0.25 : m[1] === "¾" ? 0.75 : parseFloat(m[1].replace(",", "."));
  return impFmt(base * factor, m[3]) + m[2] + m[3];
}

export function parseRecipeText(raw){
  const dropped = [];
  const lines = [];
  String(raw).split(/\r?\n/).forEach(l => {
    const c = cleanLine(l);
    if (c) lines.push(c);
    else if (String(l).trim()) dropped.push(String(l).replace(/\s+/g, " ").trim());
  });
  const bullet = l => l.replace(/^[•·●▪■□*✔✓☑>»→~\-–—]+\s*/, "").trim();
  const H_Z = /^(zutaten|das brauchst du|du brauchst|einkaufsliste|ingredients)\b[:\s]*/i;
  const H_S = /^(zubereitung|so geht'?s|so gehts|und so geht'?s|anleitung|schritte|zubereitungsschritte|method)\b[:\s]*/i;
  const H_N = /^(n[aä]hrwerte|macros|nutrition)\b/i;
  let st = "head";
  const head = [], zl = [], sl = [];
  let sawZ = false;
  lines.forEach(l => {
    let m;
    if ((m = l.match(H_Z))) {
      st = "z"; sawZ = true;
      const rest = bullet(l.slice(m[0].length));
      if (rest && !/^(für|fuer)\s+\d/i.test(rest) && !/^\(.*\)$/.test(rest)) zl.push(rest);
      return;
    }
    if ((m = l.match(H_S))) {
      st = "s";
      const rest = l.slice(m[0].length).trim();
      if (rest) sl.push(rest);
      return;
    }
    if (H_N.test(l)) { st = "n"; return; }
    if (st === "head") head.push(l);
    else if (st === "z") zl.push(bullet(l));
    else if (st === "s") sl.push(l);
  });
  const amount = /^(\d|½|¼|¾|ein |eine |einen |etwas |je |prise |n\. ?b\.|nach geschmack)/i;
  if (!sawZ) {
    zl.length = 0; sl.length = 0;
    lines.forEach(l => {
      const b = bullet(l);
      if (amount.test(b) && b.length < 80 && !/[.!?]$/.test(b) && !/\bkcal\b/i.test(b)) zl.push(b);
      else if (b.length >= 25 && l !== head[0]) sl.push(l);
    });
  }
  const text = lines.join(IMPNL);
  let kcal = "", prot = "", t = "", portions = 0, m;
  if ((m = text.match(/(\d{2,4})\s*(?:kcal|kalorien)\b/i))) kcal = m[1];
  if ((m = text.match(/(?:eiwei(?:ß|ss)|protein)\w*[^\d\n]{0,14}?(\d{1,3})(?:[.,]\d+)?\s*g\b/i)) || (m = text.match(/(\d{1,3})(?:[.,]\d+)?\s*g\s*(?:eiwei(?:ß|ss)|protein)/i))) prot = parseInt(m[1], 10) <= 200 ? m[1] : "";
  if ((m = text.match(/(?:zeit|dauer)[^\d\n]{0,18}(\d{1,3})\s*min/i)) || (m = text.match(/(\d{1,3})\s*min(?:uten)?\b/i))) t = m[1] + " Min";
  if ((m = text.match(/(\d{1,2})\s*(?:portionen|portion|personen|person)\b/i)) || (m = text.match(/f(?:ü|ue)r\s+(\d{1,2})\b/i))) portions = parseInt(m[1], 10);
  const n = (head.find(l => l.length >= 3 && l.length <= 70 && !/\d+\s*(kcal|min)/i.test(l)) || head[0] || "").replace(/\s*[:–-]\s*$/, "").replace(/^rezept\s*[:\-]?\s*/i, "").slice(0, 60);
  const numbered = sl.some(l => /^(?:schritt\s*)?\d{1,2}[.):\-]\s*\S/i.test(l));
  const steps = [];
  sl.forEach(l => {
    const mm = l.match(/^(?:schritt\s*)?(\d{1,2})[.):\-]\s*(.*)$/i);
    if (mm) { steps.push(mm[2]); return; }
    const prev = steps[steps.length - 1];
    if (!steps.length || (!numbered && /[.!?]$/.test(prev))) steps.push(l);
    else steps[steps.length - 1] = prev + " " + l;
  });
  let z = zl.filter(x => x && x.length > 1 && !/^(für|fuer)\s+\d/i.test(x));
  if (portions > 0 && portions !== 2) {
    const f = 2 / portions;
    z = z.map(l => impScale(l, f));
  }
  return { n, z, s: steps.filter(Boolean), t, k: kcal, p: prot, portions, dropped };
}
