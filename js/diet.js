/* Erkennt vegetarische Rezepte. Eine gespeicherte Wahl hat Vorrang.
   Ein alter Eintrag „vegan“ gilt als vegetarisch. */

const MEAT = [
  "haehnchen","huhn","huehner","pute","puten","rind","rinder","hackfleisch","hack",
  "schwein","schweine","speck","schinken","salami","wurst","wiener","fleisch","fisch",
  "lachs","thunfisch","garnele","garnelen","bacon","schnitzel","steak","gyros","ente",
  "lamm","kabeljau","forelle","shrimp","leber","schmalz","gelatine","anchovis","sardelle",
  "sardinen","meeresfruechte","kalb","wild","reh","hirsch","gans","hering","makrele",
  "muschel","tintenfisch","scholle","krebs","chorizo",
];

export function normDiet(s){
  return String(s || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenHits(token, key){
  if (token === key) return true;
  if (key.length >= 4 && (token.startsWith(key) || token.endsWith(key))) return true;
  return false;
}

function hasWord(text, keys){
  const tokens = text.split(" ").filter(Boolean);
  return keys.some(key => tokens.some(t => tokenHits(t, key)));
}

function withoutNegatedMeat(text){
  return text.replace(/\bohne\s+([a-z0-9]+)/g, (all, word) => {
    if (MEAT.some(k => tokenHits(word, k))) return " ";
    return all;
  });
}

/** "fleisch" oder "vegetarisch". Pflanzliche Rezepte zählen als vegetarisch.
    „ohne Hähnchen“ zählt nicht als Fleisch. */
export function detectDiet(lines){
  const text = withoutNegatedMeat((Array.isArray(lines) ? lines : []).map(normDiet).join(" "));
  if (hasWord(text, MEAT)) return "fleisch";
  return "vegetarisch";
}

export function dietOf(recipe, manual){
  const id = recipe && recipe.id;
  const m = manual && id ? manual[id] : "";
  if (m === "vegan" || m === "vegetarisch") return "vegetarisch";
  if (m === "fleisch") return "fleisch";
  return detectDiet(recipe && recipe.z);
}

export function dietPasses(kind, filter){
  if (!filter || filter === "Alle") return true;
  if (filter === "Vegetarisch" || filter === "Vegan") return kind === "vegetarisch" || kind === "vegan";
  return true;
}

export function dietMark(kind){
  if (kind !== "vegetarisch" && kind !== "vegan") return "";
  return `<span class="dietmark" title="vegetarisch" aria-label="vegetarisch">v</span>`;
}
