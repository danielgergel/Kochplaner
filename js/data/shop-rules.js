/* Zuordnung von Zutatenzeilen zu Einkaufskategorien. */
const fn=(x,f)=>{const v=x*f;if(v>=20)return String(Math.round(v/5)*5);if(Math.abs(v-Math.round(v))<0.05&&v>=1)return String(Math.round(v));const r=Math.max(0.5,Math.round(v*2)/2),i=Math.floor(r);return r===i?String(i):(i?i+"½":"½");};
const sc=(str,f)=>str.split(/,\s+(?=[\d½])/).map(p=>{const m=p.match(/^((?:[A-Za-zÄÖÜäöüß\- ]+:\s*)?)(½|\d+(?:[.,]\d+)?)(?:–(½|\d+(?:[.,]\d+)?))?(.*)$/);if(!m)return p;const n=s=>s==="½"?0.5:parseFloat(s.replace(",","."));let o=m[1]+fn(n(m[2]),f);if(m[3])o+="–"+fn(n(m[3]),f);return o+m[4];}).join(", ");
/* Einkaufslisten aus den Rezepten berechnen */
const CATS=["Fleisch & Wurst","Milchprodukte & Eier","Gemüse & Obst","Trockenware, Brot & Sonstiges"];
const G="Gemüse & Obst",FL="Fleisch & Wurst",MI="Milchprodukte & Eier",TR="Trockenware, Brot & Sonstiges",VO="Vorrat prüfen";
const RULES=[
[/^salat, tomate, gurke$/,"Salat / Tomate / Gurke",G],[/gnocchi/,"Gnocchi",TR],[/fladenbrot/,"Fladenbrot",TR],[/hummus/,"Hummus",TR],[/halloumi/,"Halloumi",MI],[/schafskäse/,"Schafskäse (Block)",MI],[/flammkuchenteig/,"Flammkuchenteig",TR],[/asiatische nudeln/,"Asiatische Nudeln (Mie, roh)",TR],[/pinienkerne/,"Pinienkerne",TR],[/rucola/,"Rucola / Salat",G],[/^gemüse \(karotten/,"Gemüse für Wok (Karotten, Sojasprossen, Bambus)",G],[/^lauch(?!zwiebel)/,"Lauch",G],[/frosta/,"Frosta Gemüse-Curry (Beutel)",TR],[/kochsahne/,"Kochsahne 7 %",MI],[/gurkensalat-fix/,"Gurkensalat-Fix",VO],
[/hähnchen\S*aufschnitt/,"Hähnchenbrust-Aufschnitt",FL],[/hähnchen/,"Hähnchenbrust",FL],[/rinderhack|^hack/,"Rinderhack (mager)",FL],[/putenschnitzel/,"Putenschnitzel",FL],[/pute/,"Putenaufschnitt",FL],
[/schinken/,"Schinken (light)",FL],[/speck/,"Speckwürfel (light)",FL],
[/high-protein-joghurt/,"Lidl High-Protein-Joghurt",MI],[/skyr/,"Skyr",MI],[/magerquark|quark/,"Magerquark",MI],[/tomatenfrischkäse/,"Tomatenfrischkäse (Packung)",MI],[/doppelrahm/,"Frischkäse Doppelrahm",MI],[/körniger|hüttenkäse/,"Körniger Frischkäse",MI],[/frischkäse/,"Frischkäse (light)",MI],
[/mozzarella/,"Mozzarella light",MI],[/parmesan/,"Parmesan",MI],[/feta/,"Feta light",MI],[/reibekäse|streukäse|^käse|light-käse/,"Reibekäse (light)",MI],
[/butter/,"Butter",MI],[/saure sahne/,"Saure Sahne",MI],[/joghurt/,"Joghurt (griechisch)",MI],[/kokosmilch/,"Kokosmilch light",MI],
[/mandel(milch|drink)/,"Mandeldrink",MI],[/coco-ananas|ananassaft/,"Coco-Ananas-Saft",TR],[/milch/,"Milch",MI],[/^eier?(\s|$)/,"Eier",MI],[/kräutercreme/,"Kräutercreme light",MI],
[/gewürzgurke/,"Gewürzgurken",G],[/süßkartoffel/,"Süßkartoffeln",G],[/kartoffel/,"Kartoffeln",G],[/getrocknete tomaten/,"Getrocknete Tomaten",G],[/tomatenmark/,"Tomatenmark",VO],[/passata|arrabiata|tomatensauce|tomatensoße|passierte/,"Tomatensoße (passierte Tomaten)",TR],[/tomate/,"Tomaten",G],
[/brokkoli/,"Brokkoli",G],[/champignon/,"Champignons",G],[/gemüse/,"Gemüse (Paprika, Zucchini, Brokkoli)",G],[/paprika/,"Paprika",G],[/zucchini/,"Zucchini",G],
[/lauchzwiebel/,"Lauchzwiebeln",G],[/zwiebel/,"Zwiebeln",G],[/gurke/,"Gurken",G],[/knoblauch/,"Knoblauch",G],[/zitrone/,"Zitrone",G],[/salat/,"Salat",G],
[/banane/,"Bananen",G],[/apfel/,"Äpfel",G],[/avocado/,"Avocado",G],[/beeren/,"Beeren (TK)",G],[/ananas/,"Ananas",G],
[/maiswaffel/,"Maiswaffeln",TR],[/reiswaffel/,"Reiswaffeln",TR],[/reis/,"Reis (roh)",TR],[/nudeln|linguine|fettuccine/,"Nudeln / Pasta (roh)",TR],[/haferflocken/,"Haferflocken",TR],
[/gepuffter dinkel/,"Gepuffter Dinkel",TR],[/whey/,"Whey-Protein",TR],[/mandeln/,"Mandeln",TR],[/erdnussmus/,"Erdnussmus",TR],[/backkakao|kakao/,"Backkakao",TR],
[/vollkornbrot|vollkorntoast|toast|bbrotb/,"Brot / Toast",TR],[/wrap/,"Wraps",TR],[/brezel/,"Brezeln",TR],[/brötchen/,"Brötchen",TR],
[/kidney/,"Kidneybohnen (Dose)",TR],[/oreo/,"Oreos",TR],[/high-protein-pudding|protein-pudding/,"High-Protein-Pudding (Schoko)",MI],[/pudding/,"Puddingpulver",TR],
[/löffelbiskuit/,"Löffelbiskuits",TR],[/mehl/,"Mehl",TR],[/passata|arrabiata|tomatensauce|tomatensoße/,"Tomatensoße (passierte Tomaten)",TR],[/lauch/,"Lauchzwiebeln",G],
[/balsamico/,"Balsamico",VO],[/honig/,"Honig",VO],[/soja/,"Sojasauce",VO],[/(^|\s)(oliven)?öl(\s|$)/,"Öl",VO],[/senf/,"Senf",VO],[/pesto/,"Pesto",VO],[/currypaste/,"Currypaste (ohne Garnelen)",VO],
[/semmelbr/,"Semmelbrösel",VO],[/chia/,"Chiasamen",VO],[/süßstoff|vanillinzucker/,"Süßstoff",VO],[/mayo/,"Light-Mayo",VO],[/ketchup/,"Ketchup",VO],[/tomatenmark/,"Tomatenmark",VO],
[/espresso/,"Espresso",VO],[/backpulver|natron/,"Backpulver",VO],[/kräuter|petersilie|schnittlauch|basilikum|dill/,"Frische Kräuter",VO],[/zartbitter/,"Zartbitterschokolade",VO],[/spinat/,"Spinat",G],[/sellerie/,"Staudensellerie",G],[/kohl/,"Kohl",G],[/cheddar/,"Cheddar",MI],[/babybel/,"Babybel",MI],[/ricotta/,"Ricotta",MI],[/bohnen/,"Bohnen (Dose)",TR],[/orzo/,"Orzo",TR],[/pizzateig|hefeteig|naan/,"Teig / Naan",TR],[/tortilla/,"Wraps",TR],[/bbq/,"BBQ-Soße",TR],[/chorizo|paprikawurst/,"Geflügel-Chorizo",FL],[/putenspeck/,"Putenspeck",FL],[/jalape/,"Jalapeños",G],[/hot ?sauce|buffalo|sriracha/,"Hot Sauce",VO],[/piri/,"Piri-Piri-Gewürz",VO],[/pasta|penne|fusilli/,"Nudeln / Pasta (roh)",TR],[/br(ü|ue)he/,"Brühe",VO],[/kichererbsen/,"Kichererbsen (Dose)",TR],[/eier/,"Eier",MI],[/k(ä|ae)se/,"Reibekäse (light)",MI]];
const SPICE=/pulver|gewürz|kreuzkümmel|chili|oregano|salz|pfeffer|eiswürfel|zimt|wasser|sriracha|maggi/;
const classify=s=>{s=s.toLowerCase();for(const [re,l,c] of RULES)if(re.test(s))return{l,c};return null;};
const fmt=(q,u)=>{if(u==="g")return q>=1000?(q/1000).toFixed(1).replace(".",",")+" kg":Math.ceil(q/10-0.001)*10+" g";
 if(u==="ml")return q>=1000?(q/1000).toFixed(1).replace(".",",")+" l":Math.ceil(q/10-0.001)*10+" ml";
 if(u==="Scheiben")return Math.ceil(q-0.001)+" Scheiben";return Math.ceil(q-0.001)+" Stk.";};

export { fn, sc, CATS, G, FL, MI, TR, VO, RULES, SPICE, classify, fmt };
