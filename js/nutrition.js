import { FOODDB } from "./data/foods.js";
import { nm, stripPl } from "./util.js";

const NUMW = { ein:1, eine:1, einen:1, einem:1, zwei:2, drei:3, vier:4, fuenf:5, sechs:6, sieben:7, acht:8, neun:9, zehn:10, halb:0.5, halbe:0.5, halben:0.5, halbes:0.5, halber:0.5 };
const GUNIT = { g:1, gr:1, gramm:1, kg:1000, ml:1, l:1000, liter:1000, el:12, tl:4 };

FOODDB.forEach(f => {
  f._a = [nm(f.n)].concat(f.a.map(nm));
  f._u = f.u.map(x => [nm(x[0]), x[1], x[0]]);
});

export function scoreFood(f, q){
  let best = 0;
  const qt = q.split(" ");
  for (const al of f._a) {
    let s = 0;
    if (q === al) s = 100 + al.length;
    else if ((" " + q + " ").includes(" " + al + " ")) s = 60 + al.length;
    else if (al.length >= 3 && q.length >= 3 && al.includes(q)) s = 40 + 10 * q.length / al.length;
    else {
      const at = al.split(" ");
      const hit = qt.filter(w => w.length >= 3 && at.some(x => x === w || stripPl(x) === stripPl(w))).length;
      if (hit) s = 20 * hit / qt.length + hit;
    }
    if (s > best) best = s;
  }
  return best;
}

export function findFoods(q){
  if (!q) return [];
  return FOODDB.map(f => ({ f, s:scoreFood(f, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 4).map(x => x.f);
}

export function parsePiece(raw){
  let t = nm(String(raw).replace(/(\d)([a-zA-Zäöüß])/g, "$1 $2").replace(/(\d),(\d)/g, "$1.$2"));
  if (!t) return null;
  const tok = t.split(" ");
  let n = 1, hasN = false;
  if (/^\d+(\.\d+)?$/.test(tok[0])) { n = parseFloat(tok[0]); tok.shift(); hasN = true; }
  else if (NUMW[tok[0]] !== undefined) { n = NUMW[tok[0]]; tok.shift(); hasN = true; }
  let unit = "";
  if (tok.length > 1 && GUNIT[tok[0]] !== undefined) unit = tok.shift();
  else if (tok.length > 1 && /^(tasse|tassen|glas|glaeser|flasche|flaschen|dose|dosen|stueck|stk|scheibe|scheiben|portion|portionen|becher|kugel|kugeln|riegel|schale|teller|handvoll)$/.test(tok[0])) unit = tok.shift();
  if (tok[0] === "x" || tok[0] === "von") tok.shift();
  const q = tok.join(" ");
  return { raw:String(raw).trim(), q, n, hasN, unit, foods:findFoods(q), fi:0 };
}

export function calcPiece(pc){
  const f = pc.foods[pc.fi];
  if (!f) return null;
  let g, label;
  const fmtq = x => String(Math.round(x * 10) / 10).replace(".", ",");
  if (pc.unit && GUNIT[pc.unit] !== undefined && !["el", "tl"].includes(pc.unit)) { g = pc.n * GUNIT[pc.unit]; label = fmtq(pc.n) + " " + pc.unit; }
  else if (pc.unit === "el" || pc.unit === "tl") { g = pc.n * GUNIT[pc.unit]; label = fmtq(pc.n) + " " + pc.unit.toUpperCase(); }
  else if (!pc.unit && pc.hasN && pc.n >= 20) { g = pc.n; label = fmtq(g) + " g"; }
  else {
    let u = null;
    if (pc.unit) u = f._u.find(x => x[0] === pc.unit || stripPl(x[0]) === stripPl(pc.unit));
    if (!u) u = f._u.find(x => x[2] !== "g" && x[2] !== "ml") || f._u[0];
    if (u[2] === "g" || u[2] === "ml") { g = pc.n * (pc.hasN ? 1 : 100); label = fmtq(g) + " " + u[2]; }
    else { g = pc.n * u[1]; label = fmtq(pc.n) + " " + u[2]; }
  }
  return { f, g, label, k:f.k * g / 100, p:f.p * g / 100 };
}

const SKIPZ = /salz|pfeffer|gewuerz|gewürz|wasser|paprikapulver|oregano|chili|kraeuter|kräuter|knoblauchpulver|zwiebelpulver|kreuzkuemmel|kreuzkümmel|zimt|muskat|petersilie|schnittlauch|dill|basilikum/i;

export function estimateRecipe(zLines, sLines){
  let k = 0, p = 0, found = 0;
  const unknown = [];
  zLines.forEach(line => String(line).split(/\s*,\s+(?=[\d½])/).forEach(part => {
    if (!part.trim()) return;
    const pc = parsePiece(part);
    if (!pc || !pc.foods.length) { if (!SKIPZ.test(part)) unknown.push(part.trim()); return; }
    pc.fi = 0;
    const c = calcPiece(pc);
    if (!c) { unknown.push(part.trim()); return; }
    let f = 1, fp = 1;
    const t = nm(part), fn = c.f.n.toLowerCase();
    if (!/gekocht|gegart|gebraten|fertig/.test(t)) {
      if (/(reis|nudel|pasta|couscous|spaghetti|linsen|bulgur|kidney|kichererbsen)/.test(fn) && /gekocht/.test(fn)) { f = fp = 2.7; }
      else if (/(gegart|gebraten)/.test(fn)) { f = 0.7; fp = 0.75; }
    }
    k += c.k * f; p += c.p * fp; found++;
  }));
  let mins = 0, any = false;
  sLines.forEach(s => {
    const m = String(s).match(/(\d+)\s*(?:–|-)\s*(\d+)\s*Min/) || String(s).match(/(\d+)\s*Min/);
    if (m) { mins += parseInt(m[2] || m[1], 10); any = true; }
  });
  let tim = any ? mins + 5 + Math.ceil(zLines.length / 3) : 10 + 5 * sLines.length;
  tim = Math.max(10, Math.round(tim / 5) * 5);
  return { k:Math.round(k / 2), p:Math.round(p / 2), t:"ca. " + tim + " Min", unknown, found };
}
