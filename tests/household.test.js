import test from "node:test";
import assert from "node:assert/strict";
import { detectDiet, dietOf, dietPasses } from "../js/diet.js";
import { SUBS, substituteFor } from "../js/data/subs.js";
import { partitionOffers, noOfferLabel } from "../js/offers.js";
import { expireChecked, CHECK_MS } from "../js/shopping.js";
import { mergeRecipe } from "../js/recipes.js";

test("Ernährung folgt den Zutaten, die manuelle Wahl gewinnt", () => {
  assert.equal(detectDiet(["150 g Hähnchenbrust", "100 g Reis"]), "fleisch");
  assert.equal(detectDiet(["300 ml Milch", "1 TL Honig"]), "vegetarisch");
  assert.equal(detectDiet(["2 Eier", "Salz"]), "vegetarisch");
  assert.equal(detectDiet(["300 ml Hafermilch", "1 Banane", "30 g Haferflocken"]), "vegan");
  assert.equal(detectDiet(["200 g Reis", "200 g Brokkoli", "1 TL Öl"]), "vegan");
  assert.equal(detectDiet(["80 g Halloumi", "40 g Hummus"]), "vegetarisch");
  assert.equal(detectDiet(["200 g High-Protein-Pudding Schoko"]), "vegetarisch");
  assert.equal(detectDiet(["1 Blatt Gelatine"]), "fleisch");
  assert.equal(dietOf({ id:"M1", z:["200 g Reis"] }, { M1:"vegetarisch" }), "vegetarisch");
  assert.equal(dietPasses("vegan", "Vegetarisch"), true);
  assert.equal(dietPasses("vegetarisch", "Vegan"), false);
  assert.equal(dietPasses("fleisch", "Alle"), true);
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
