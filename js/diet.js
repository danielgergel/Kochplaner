/* Erkennt vegan / vegetarisch aus den Zutaten. Manuelle Wahl hat Vorrang. */

const MEAT = [
  "haehnchen","huhn","huehner","pute","puten","rind","rinder","hackfleisch","hack",
  "schwein","schweine","speck","schinken","salami","wurst","wiener","fleisch","fisch",
  "lachs","thunfisch","garnele","garnelen","bacon","schnitzel","steak","gyros","ente",
  "lamm","kabeljau","forelle","shrimp","leber","schmalz","gelatine","anchovis","sardelle",
  "sardinen","meeresfruechte","kalb","wild","reh","hirsch","gans","hering","makrele",
  "muschel","tintenfisch","scholle","krebs","chorizo",
];

const DAIRY = [
  "milch","sahne","joghurt","skyr","quark","kaese","butter","ei","eier","eigelb","eiweiss",
  "honig","mozzarella","parmesan","frischkaese","huettenkaese","schmand","molke","ghee",
  "mascarpone","ricotta","feta","gouda","emmentaler","whey","casein","laktose","pecorino",
  "cheddar","gruyere","sahnejoghurt","buttermilch","halloumi","grillkaese","burrata","pudding",
];

const PLANT_MILK = /hafermilch|mandelmilch|sojamilch|kokosmilch|reismilch|erbsenmilch|haferdrink|mandeldrink|sojadrink/g;

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

/** "fleisch" | "vegetarisch" | "vegan" */
export function detectDiet(lines){
  const raw = (Array.isArray(lines) ? lines : []).map(normDiet).join(" ");
  const text = raw.replace(PLANT_MILK, " ");
  if (hasWord(text, MEAT)) return "fleisch";
  if (hasWord(text, DAIRY)) return "vegetarisch";
  return "vegan";
}

export function dietOf(recipe, manual){
  const id = recipe && recipe.id;
  const m = manual && id ? manual[id] : "";
  if (m === "vegan" || m === "vegetarisch" || m === "fleisch") return m;
  return detectDiet(recipe && recipe.z);
}

export function dietPasses(kind, filter){
  if (!filter || filter === "Alle") return true;
  if (filter === "Vegan") return kind === "vegan";
  if (filter === "Vegetarisch") return kind === "vegan" || kind === "vegetarisch";
  return true;
}

const LEAF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19C5 11 12 5 20 4c-1 8-8 15-15 15z"/><path d="M8.5 16.5c2-2.2 4.2-5 6.5-8"/></svg>';
const EGG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c3.2 0 5.5 4.2 5.5 8.2 0 4.2-2.4 8.8-5.5 8.8s-5.5-4.6-5.5-8.8C6.5 7.7 8.8 3.5 12 3.5z"/></svg>';

export function dietMark(kind){
  if (kind !== "vegan" && kind !== "vegetarisch") return "";
  const label = kind === "vegan" ? "vegan" : "vegetarisch";
  return `<span class="dietmark" title="${label}" aria-label="${label}">${kind === "vegan" ? LEAF : EGG}</span>`;
}
