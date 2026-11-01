/* Eingebaute Ersatz-Zutaten. Alles offline, nichts wird nachgeladen. */

const RAW = [
  ["kreuzkuemmel","Kreuzkümmel",["Koriander und Paprika","Currypulver"],["cumin"]],
  ["paprikapulver","Paprikapulver",["Chilipulver","Cayennepfeffer"],["edelsuess","rosenscharf"]],
  ["chili","Chili",["Paprika und Cayenne","Cayennepfeffer"],["chiliflocken","chiliplver"]],
  ["cayenne","Cayenne",["Chilipulver","Paprika"],["cayennepfeffer"]],
  ["kurkuma","Kurkuma",["Currypulver","Safran"],[]],
  ["zimt","Zimt",["Nelkenpulver","Vanille"],[]],
  ["muskat","Muskat",["Zimt","Piment"],["muskatnuss"]],
  ["oregano","Oregano",["Thymian","Basilikum"],[]],
  ["thymian","Thymian",["Oregano","Rosmarin"],[]],
  ["rosmarin","Rosmarin",["Thymian","Salbei"],[]],
  ["basilikum","Basilikum",["Oregano","Petersilie"],[]],
  ["petersilie","Petersilie",["Basilikum","Schnittlauch"],[]],
  ["schnittlauch","Schnittlauch",["Petersilie","Frühlingszwiebel"],[]],
  ["koriander","Koriander",["Petersilie und etwas Zitrone","Dill"],["koriandergruen"]],
  ["dill","Dill",["Petersilie","Fenchelgrün"],[]],
  ["minze","Minze",["Basilikum","Petersilie"],["pfefferminze"]],
  ["lorbeer","Lorbeer",["Thymian","Oregano"],["lorbeerblatt"]],
  ["nelken","Nelken",["Zimt","Muskat"],[]],
  ["ingwer","Ingwer",["Knoblauch und Zitrone","Galgant"],["ingwerpulver"]],
  ["knoblauch","Knoblauch",["Knoblauchpulver","Zwiebel"],["knoblauchzehe"]],
  ["knoblauchpulver","Knoblauchpulver",["frischer Knoblauch","Zwiebelpulver"],[]],
  ["zwiebel","Zwiebel",["Schalotte","Lauch"],["zwiebeln"]],
  ["zwiebelpulver","Zwiebelpulver",["geriebene Zwiebel","Knoblauchpulver"],[]],
  ["curry","Curry",["Kurkuma, Kreuzkümmel und Paprika","Garam Masala"],["currypulver"]],
  ["garam","Garam Masala",["Currypulver","Kreuzkümmel und Zimt"],["garam masala"]],
  ["senf","Senf",["Meerrettich","Wasabi"],[]],
  ["meerrettich","Meerrettich",["Senf","Wasabi"],[]],
  ["kuemmel","Kümmel",["Kreuzkümmel","Fenchelsamen"],[]],
  ["majoran","Majoran",["Oregano","Thymian"],[]],
  ["salbei","Salbei",["Thymian","Rosmarin"],[]],
  ["estragon","Estragon",["Dill","Petersilie"],[]],
  ["fenchel","Fenchelsamen",["Kümmel","Anis"],["fenchelsamen"]],
  ["piment","Piment",["Nelken und Zimt","Muskat"],[]],
  ["vanille","Vanille",["Vanillezucker","Vanilleextrakt"],["vanillezucker","vanilleschote"]],
  ["kakao","Kakao",["Backkakao","dunkle Schokolade"],["backkakao"]],
  ["schokolade","Schokolade",["Kakao und etwas Butter","Schokotropfen"],[]],
  ["milch","Milch",["Hafermilch","Sojamilch"],[]],
  ["sahne","Sahne",["Kokosmilch","Hafercuisine"],["schlagsahne","kochsahne","sahne cuisine"]],
  ["schmand","Schmand",["Saure Sahne","Joghurt"],[]],
  ["saure sahne","Saure Sahne",["Joghurt mit einem Spritzer Zitrone","Schmand"],["sauerrahm"]],
  ["creme fraiche","Crème fraîche",["Saure Sahne","Schmand"],["creme fraiche"]],
  ["butter","Butter",["Margarine","neutrales Öl"],[]],
  ["margarine","Margarine",["Butter","Öl"],[]],
  ["joghurt","Joghurt",["Skyr","Sojajoghurt"],[]],
  ["skyr","Skyr",["Magerquark","Naturjoghurt"],[]],
  ["quark","Quark",["Skyr","Joghurt"],[]],
  ["magerquark","Magerquark",["Skyr","Quark"],[]],
  ["frischkaese","Frischkäse",["Quark","Hummus"],["frischekaese"]],
  ["huettenkaese","Hüttenkäse",["körniger Frischkäse","Quark"],["korniger frischkaese"]],
  ["mozzarella","Mozzarella",["milder Feta","veganer Mozzarella"],[]],
  ["parmesan","Parmesan",["Hefeflocken","Pecorino"],[]],
  ["reibekaese","Reibekäse",["geriebener Mozzarella","veganer Reibekäse"],[]],
  ["feta","Feta",["Schafskäse","Tofu mit Salz und Zitrone"],["schafskaese"]],
  ["mascarpone","Mascarpone",["Frischkäse und Sahne","Quark und Sahne"],[]],
  ["buttermilch","Buttermilch",["Milch mit einem Spritzer Zitrone","Joghurt mit Wasser"],[]],
  ["sahnejoghurt","Sahnejoghurt",["Joghurt und ein Löffel Sahne","Schmand"],[]],
  ["eier","Eier",["Apfelmus und etwas Backpulver (zum Backen)","1 EL gemahlene Leinsamen + 3 EL Wasser pro Ei"],["ei"]],
  ["eigelb","Eigelb",["ganzes Ei","1 EL Joghurt"],[]],
  ["eiweiss","Eiweiß",["Aquafaba (Kichererbsenwasser)","ein weiteres ganzes Ei"],[]],
  ["mehl","Mehl",["Dinkelmehl","gemahlene Haferflocken"],["weizenmehl"]],
  ["speisestaerke","Speisestärke",["Mehl","Kartoffelstärke"],["staerke"]],
  ["semmelbroesel","Semmelbrösel",["Paniermehl","zerdrückte Haferflocken"],["paniermehl"]],
  ["haferflocken","Haferflocken",["andere Flocken","Hafermehl"],[]],
  ["zucker","Zucker",["Honig","Süßstoff nach Packung"],["rohrzucker"]],
  ["puderzucker","Puderzucker",["sehr fein gemahlener Zucker","Honig (weniger)"],[]],
  ["brauner zucker","Brauner Zucker",["weißer Zucker","Honig"],["brauner"]],
  ["honig","Honig",["Ahornsirup","Agavendicksaft"],[]],
  ["ahornsirup","Ahornsirup",["Honig","Agavendicksaft"],[]],
  ["suessstoff","Süßstoff",["Zucker","Honig"],[]],
  ["oel","Öl",["Rapsöl","Olivenöl"],[]],
  ["olivenoel","Olivenöl",["Rapsöl","Sonnenblumenöl"],[]],
  ["rapsoel","Rapsöl",["Sonnenblumenöl","Olivenöl"],[]],
  ["sonnenblumenoel","Sonnenblumenöl",["Rapsöl","Olivenöl"],[]],
  ["sesamoel","Sesamöl",["neutrales Öl und etwas Sesam","Erdnussöl"],[]],
  ["kokosoel","Kokosöl",["Butter","neutrales Öl"],[]],
  ["essig","Essig",["Zitronensaft","Balsamico"],[]],
  ["balsamico","Balsamico",["Essig und eine Prise Zucker","Rotweinessig"],["balsamicoessig"]],
  ["apfelessig","Apfelessig",["heller Essig","Zitronensaft"],[]],
  ["bruehe","Brühe",["Gemüsebrühe","Salz, Wasser und Kräuter"],["instantbruehe"]],
  ["gemuesebruehe","Gemüsebrühe",["Brühe","Wasser mit Salz und Lorbeer"],[]],
  ["huehnerbruehe","Hühnerbrühe",["Gemüsebrühe","Brühe"],[]],
  ["rinderbruehe","Rinderbrühe",["Gemüsebrühe","Brühe"],[]],
  ["sojasauce","Sojasauce",["Salz und ein Spritzer Balsamico","Tamari"],["soja sauce"]],
  ["zitrone","Zitrone",["Limette","ein Spritzer Essig"],["zitronensaft"]],
  ["limette","Limette",["Zitrone","Zitronensaft"],[]],
  ["tomatenmark","Tomatenmark",["passierte Tomaten, eingekocht","Ketchup"],[]],
  ["kokosmilch","Kokosmilch",["Sahne","Hafercuisine"],[]],
  ["hafermilch","Hafermilch",["andere Pflanzenmilch","Milch"],[]],
  ["sojamilch","Sojamilch",["Hafermilch","Milch"],[]],
  ["mandelmilch","Mandelmilch",["Hafermilch","Milch"],[]],
  ["wein","Wein",["Brühe und ein Spritzer Essig"],[]],
  ["weisswein","Weißwein",["Brühe und Zitronensaft","Weißweinessig stark verdünnt"],[]],
  ["rotwein","Rotwein",["Brühe und Balsamico","Traubensaft"],[]],
  ["hefe","Hefe",["Backpulver und etwas Zitronensaft","Sauerteig"],["trockenhefe"]],
  ["backpulver","Backpulver",["Natron und etwas Zitrone","Hefe"],[]],
  ["natron","Natron",["Backpulver","Kaiser-Natron"],[]],
  ["mandeln","Mandeln",["Haselnüsse","Sonnenblumenkerne"],["mandel"]],
  ["walnuesse","Walnüsse",["Pekannüsse","Mandeln"],["walnuss"]],
  ["erdnussmus","Erdnussmus",["Mandelmus","Tahin"],["erdnussbutter"]],
  ["erdnuesse","Erdnüsse",["Mandeln","Cashews"],["erdnuss"]],
  ["cashews","Cashews",["Mandeln","Sonnenblumenkerne"],["cashew"]],
  ["haselnuesse","Haselnüsse",["Mandeln","Walnüsse"],["haselnuss"]],
  ["pinienkerne","Pinienkerne",["Sonnenblumenkerne","gehackte Mandeln"],[]],
  ["sesam","Sesam",["Sonnenblumenkerne","Sesamöl"],[]],
  ["tahin","Tahin",["Erdnussmus","Sonnenblumenmus"],["sesammus"]],
  ["mayonnaise","Mayonnaise",["Joghurt und Senf","Skyr und Senf"],["mayo"]],
  ["kapern","Kapern",["fein gehackte saure Gurke","grüne Oliven"],[]],
  ["speck","Speck",["geräucherter Tofu","Räuchertofu"],[]],
  ["schinken","Schinken",["geräucherter Tofu","Putenaufschnitt, wenn Fleisch bleiben darf"],[]],
  ["hackfleisch","Hackfleisch",["Linsen oder Soja-Hack","zerdrückte Kichererbsen"],["rinderhack","hack"]],
  ["haehnchen","Hähnchen",["Tofu oder Kichererbsen","Pute"],["haehnchenbrust","huhn"]],
  ["fisch","Fisch",["Tofu mit Algenflocken","Kichererbsen"],[]],
  ["lachs","Lachs",["geräucherter Tofu","Forelle"],[]],
  ["thunfisch","Thunfisch",["Kichererbsen mit Sojasauce","ein anderer fester Fisch"],[]],
  ["whey","Whey",["Sojaprotein","Erbsenprotein"],["molkenprotein"]],
  ["fruehlingszwiebel","Frühlingszwiebel",["Schnittlauch","Lauch"],["lauchzwiebel"]],
  ["lauch","Lauch",["Zwiebel","Frühlingszwiebel"],["porree"]],
  ["schalotte","Schalotte",["Zwiebel","Frühlingszwiebel"],[]],
  ["tofu","Tofu",["Kichererbsen","Tempeh"],[]],
  ["tempeh","Tempeh",["Tofu","Linsen"],[]],
  ["linsen","Linsen",["Kichererbsen","Bohnen"],[]],
  ["kichererbsen","Kichererbsen",["weiße Bohnen","Linsen"],[]],
  ["bohnen","Bohnen",["Linsen","Kichererbsen"],["kidneybohnen"]],
  ["reis","Reis",["Couscous","Quinoa"],[]],
  ["nudeln","Nudeln",["Reis","andere Pasta"],["pasta","spaghetti"]],
  ["kartoffel","Kartoffel",["Süßkartoffel","Knödel"],["kartoffeln"]],
  ["suesskartoffel","Süßkartoffel",["Kartoffel","Kürbis"],[]],
  ["brokkoli","Brokkoli",["Blumenkohl","Romanesco"],[]],
  ["blumenkohl","Blumenkohl",["Brokkoli","Romanesco"],[]],
  ["spinat","Spinat",["Mangold","junge Blattkohle"],[]],
  ["zucchini","Zucchini",["Aubergine","Gurke (zum Schmoren kürzer)"],[]],
  ["aubergine","Aubergine",["Zucchini","Pilze"],[]],
  ["pilze","Pilze",["Aubergine","Zucchini"],["champignons"]],
  ["paprikaschote","Paprikaschote",["Tomate und etwas Chili","Zucchini"],["paprika"]],
  ["tomate","Tomate",["passierte Tomaten","Paprika"],["tomaten"]],
  ["gurke","Gurke",["Zucchini, roh","Salat"],["gurken"]],
  ["salat","Salat",["Gurke","Spinat"],[]],
  ["zitrone2","Zitronenschale",["abgeriebene Limette","etwas Zitronensaft"],["zitronenschale","zitronenabrieb"]],
];

function normSub(s){
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

export const SUBS = RAW.map(([id, name, alts, extra]) => ({
  id, name, alts,
  keys: [name, ...(extra || [])].map(normSub).filter(Boolean),
}));

function tokenHits(token, key){
  if (!key) return false;
  if (key.includes(" ")) return false;
  if (token === key) return true;
  if (key.length >= 4 && (token.startsWith(key) || token.endsWith(key))) return true;
  return false;
}

function lineHits(text, key){
  if (!key) return false;
  if (key.includes(" ")) return (" " + text + " ").includes(" " + key + " ");
  return text.split(" ").some(t => tokenHits(t, key));
}

export function substituteFor(line){
  const text = normSub(line);
  if (!text) return null;
  let best = null, bestLen = 0;
  for (const e of SUBS) {
    for (const key of e.keys) {
      if (key.length > bestLen && lineHits(text, key)) { best = e; bestLen = key.length; }
    }
  }
  return best ? { id: best.id, name: best.name, alts: best.alts } : null;
}

export function substituteById(id){
  return SUBS.find(e => e.id === id) || null;
}
