/* Anzeigename für Rezeptnummern. Die gespeicherte id bleibt unverändert. */

export function idNumber(id){
  const n = parseInt(String(id || "").slice(1), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Kurzes Schild: eingebaute Rezepte behalten F1, M2, … Eigene werden X1, X2 nach Erstellzeit. */
export function badgeOf(id, cust){
  if (typeof id !== "string" || !id) return "";
  if (id[0] !== "X") return id;
  const seen = new Set();
  const ids = [];
  for (const r of (Array.isArray(cust) ? cust : [])) {
    const x = r && r.id;
    if (typeof x !== "string" || x[0] !== "X" || seen.has(x)) continue;
    seen.add(x);
    ids.push(x);
  }
  ids.sort((a, b) => idNumber(a) - idNumber(b) || (a < b ? -1 : a > b ? 1 : 0));
  const i = ids.indexOf(id);
  return i >= 0 ? "X" + (i + 1) : "Eigen";
}

/** Suchtext: Name, gespeicherte id, sichtbares Schild und die Zutaten. */
export function haystack(r, cust){
  const n = r && r.n ? r.n : "";
  const id = r && r.id ? r.id : "";
  const z = Array.isArray(r && r.z) ? r.z.join(" ") : "";
  return (n + " " + id + " " + badgeOf(id, cust) + " " + z).toLowerCase();
}

const SYNONYMS = [
  ["feta", "schafskaese", "hirtenkaese"],
  ["nudel", "pasta", "spaghetti", "penne", "fusilli", "makkaroni", "tagliatelle", "farfalle"],
  ["haehnchen", "huhn", "chicken", "huehnchen"],
  ["hack", "hackfleisch"],
];

export function normSearch(s){
  return String(s || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Einfacher Stamm: -en, -n, -e oder -s nur, wenn mindestens 4 Zeichen bleiben. */
export function stemSearch(word){
  const suf = ["en", "n", "e", "s"];
  for (const s of suf) {
    if (word.length - s.length >= 4 && word.endsWith(s)) return word.slice(0, -s.length);
  }
  return word;
}

function expandWord(word){
  const stem = stemSearch(word);
  const out = new Set([word, stem]);
  for (const group of SYNONYMS) {
    const hit = group.some(x => x === word || x === stem || stemSearch(x) === stem || stemSearch(x) === word);
    if (!hit) continue;
    for (const x of group) {
      out.add(x);
      out.add(stemSearch(x));
    }
  }
  return out;
}

function tokenKeys(text){
  const set = new Set();
  for (const w of normSearch(text).split(" ")) {
    if (!w) continue;
    for (const k of expandWord(w)) set.add(k);
  }
  return set;
}

const searchCache = new Map();

export function clearSearchCache(){
  searchCache.clear();
}

function indexed(r, cust){
  const id = r && r.id ? r.id : "";
  const hit = id && searchCache.get(id);
  if (hit) return hit;
  const name = normSearch((r && r.n ? r.n : "") + " " + id + " " + badgeOf(id, cust));
  const ing = normSearch(Array.isArray(r && r.z) ? r.z.join(" ") : "");
  const rec = { name: tokenKeys(name), all: tokenKeys(name + " " + ing) };
  if (id) searchCache.set(id, rec);
  return rec;
}

function covers(keys, words){
  return words.every(w => {
    for (const n of expandWord(w)) {
      if (keys.has(n)) return true;
      if (n.length < 4) continue;
      for (const k of keys) {
        if (k.length < 4) continue;
        if (k.startsWith(n) || n.startsWith(k)) return true;
      }
    }
    return false;
  });
}

/** 0 = Treffer im Namen, 1 = nur über Zutaten, -1 = kein Treffer. Leere Suche ist 0. */
export function recipeRank(r, query, cust){
  const words = normSearch(query).split(" ").filter(Boolean);
  if (!words.length) return 0;
  const idx = indexed(r, cust);
  if (covers(idx.name, words)) return 0;
  if (covers(idx.all, words)) return 1;
  return -1;
}
