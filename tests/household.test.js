import test from "node:test";
import assert from "node:assert/strict";
import { detectDiet, dietOf, dietPasses, dietMark } from "../js/diet.js";
import { SUBS, substituteFor } from "../js/data/subs.js";
import { partitionOffers, noOfferLabel, chainOf, chainLabel, groupOffersByChain } from "../js/offers.js";
import { expireChecked, CHECK_MS } from "../js/shopping.js";
import { mergeRecipe } from "../js/recipes.js";

test("Ernährung folgt den Zutaten, die manuelle Wahl gewinnt", () => {
  assert.equal(detectDiet(["150 g Hähnchenbrust", "100 g Reis"]), "fleisch");
  assert.equal(detectDiet(["300 ml Milch", "1 TL Honig"]), "vegetarisch");
  assert.equal(detectDiet(["2 Eier", "Salz"]), "vegetarisch");
  assert.equal(detectDiet(["300 ml Hafermilch", "1 Banane", "30 g Haferflocken"]), "vegetarisch");
  assert.equal(detectDiet(["200 g Reis", "200 g Brokkoli", "1 TL Öl"]), "vegetarisch");
  assert.equal(detectDiet(["80 g Halloumi", "40 g Hummus"]), "vegetarisch");
  assert.equal(detectDiet(["150 g Hähnchenbrust", "100 g Reis"]), "fleisch");
  assert.equal(dietOf({ id:"M1", z:["150 g Hähnchenbrust"] }, { M1:"vegan" }), "vegetarisch");
  assert.equal(dietOf({ id:"F1", z:["200 g Reis"] }, {}), "vegetarisch");
  assert.equal(dietPasses("vegan", "Vegetarisch"), true);
  assert.equal(dietPasses("vegetarisch", "Vegetarisch"), true);
  assert.equal(dietPasses("fleisch", "Vegetarisch"), false);
  assert.equal(dietPasses("fleisch", "Alle"), true);
  const mark = dietMark("vegetarisch");
  assert.match(mark, />v</);
  assert.doesNotMatch(mark, /<svg/);
  assert.equal(dietMark("vegan").includes(">v<"), true);
  assert.equal(dietMark("fleisch"), "");
});

test("Ersatzliste kennt Kreuzkümmel und bleibt bei Pflanzenmilch", () => {
  assert.ok(SUBS.length >= 80);
  const cumin = substituteFor("1 TL Kreuzkümmel");
  assert.ok(cumin);
  assert.match(cumin.alts.join(" "), /Koriander/);
  assert.match(cumin.alts.join(" "), /Paprika/);
  assert.equal(substituteFor("300 ml Hafermilch").id, "hafermilch");
  assert.equal(substituteFor("Salz und Pfeffer"), null);
  assert.equal(substituteFor("1 Paprika").id, "paprikaschote");
  assert.equal(substituteFor("1 TL Paprikapulver").id, "paprikapulver");
});

test("Angebote ohne Treffer rutschen in eine Zeile", () => {
  const items = ["Milch", "Reis", "Bananen"];
  const parts = partitionOffers(items, item => item === "Milch" ? 2 : 0, () => false);
  assert.deepEqual(parts.shown, ["Milch"]);
  assert.deepEqual(parts.rest, ["Reis", "Bananen"]);
  const skipped = partitionOffers(items, () => 0, (item, i) => i === 2);
  assert.deepEqual(skipped.shown, []);
  assert.equal(skipped.rest.length, 3);
  assert.equal(noOfferLabel(1), "1 Artikel ohne Angebot");
  assert.equal(noOfferLabel(14), "14 Artikel ohne Angebot");
});

test("abgehakte Artikel verschwinden nach 30 Minuten, alte Haken ohne Zeit bleiben", () => {
  assert.equal(CHECK_MS, 30 * 60 * 1000);
  const now = 1_760_000_000_000;
  const fresh = expireChecked(
    { a: now - 1000, b: 1, c: now - CHECK_MS - 1 },
    [{ t:"Salz", d:true, at: now - CHECK_MS - 5 }, { t:"Pfeffer", d:true, at: now - 1000 }, { t:"Öl", d:false }],
    {},
    now,
    CHECK_MS,
  );
  assert.equal(fresh.sc.a, now - 1000);
  assert.equal(fresh.sc.b, 1);
  assert.equal(fresh.sc.c, undefined);
  assert.equal(fresh.sx.c, 1);
  assert.deepEqual(fresh.extra.map(x => x.t), ["Pfeffer", "Öl"]);
  assert.equal(fresh.changed, true);
});

test("Angebote stehen je Ladenkette zusammen, Filialen zählen als eine Kette", () => {
  assert.equal(chainOf("Lidl"), "Lidl");
  assert.equal(chainOf("ALDI SÜD"), "Aldi");
  assert.equal(chainOf("Aldi Nord"), "Aldi");
  assert.equal(chainOf("E center"), "Edeka");
  assert.equal(chainOf("Netto Marken-Discount"), "Netto");
  const items = ["Milch", "Reis", "Bananen", "Öl"];
  const hits = {
    Milch: [{ s:"Lidl", n:"Haltbare Milch", pr:"0.99" }, { s:"Aldi Süd", n:"H-Milch", pr:"0.95" }, { s:"Aldi Nord", n:"Milch", pr:"1.05" }],
    Reis: [{ s:"Lidl Filiale", n:"Basmati Reis", pr:"1.49" }, { s:"REWE", n:"Reis", pr:"1.79" }],
    Bananen: [{ s:"Lidl", n:"Bananen", pr:"1.11" }],
    Öl: [],
  };
  const g = groupOffersByChain(items, item => hits[item]);
  assert.deepEqual(g.stores.map(s => s.chain), ["Lidl", "Aldi", "REWE"]);
  assert.deepEqual(g.stores.map(s => s.count), [3, 1, 1]);
  assert.equal(g.stores[1].rows[0].hits.length, 2);
  assert.deepEqual(g.rest, ["Öl"]);
  assert.equal(chainLabel("Lidl", 3, 4), "Lidl (3 von 4)");
  assert.equal(g.total, 4);
});

test("eine geänderte Fassung behält die Rezeptnummer", () => {
  const base = { id:"M1", n:"Pfanne", k:10, p:2, z:["Reis"], s:["Kochen"], ns:false, w:0.5 };
  const merged = mergeRecipe(base, { id:"M1", n:"Meine Pfanne", cust:1, z:["Reis","Salat"] });
  assert.equal(merged.id, "M1");
  assert.equal(merged.n, "Meine Pfanne");
  assert.equal(merged.cust, undefined);
  assert.equal(merged.over, 1);
  assert.equal(merged.w, 0.5);
  assert.equal(base.n, "Pfanne");
});
