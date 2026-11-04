import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeProduct, validEan, numIn, amountCalc, defaultAmount, foodFromProduct, productFromFood, mealItemFromProduct, cleanText } from "../js/product.js";
import { sanitizeDiary } from "../js/validate.js";
import { setCustomFoods, parseMeal, matchFoods, itemKcal, itemProt, itemGrams } from "../js/meal.js";

const off = pr => ({ status: 1, product: pr });

test("normales Produkt: Name mit Marke, kcal, Eiweiß, Portion, Packung", () => {
  const p = shapeProduct(off({ product_name: "Skyr Vanille", brands: "Arla,Foo", nutriments: { "energy-kcal_100g": 62, proteins_100g: 10.5 }, serving_quantity: "150", serving_size: "1 Becher (150 g)", product_quantity: 450, quantity: "450 g" }));
  assert.equal(p.n, "Arla Skyr Vanille");
  assert.equal(p.k, 62); assert.equal(p.p, 10.5); assert.equal(p.s, 150); assert.equal(p.q, 450);
  assert.equal(p.v, 2);
});

test("ohne Nährwerte, Portion fehlt, kJ statt kcal", () => {
  const none = shapeProduct(off({ product_name: "Mystery", nutriments: {} }));
  assert.equal(none.k, null); assert.equal(none.p, null); assert.equal(none.s, null);
  const kj = shapeProduct(off({ product_name: "Riegel", nutriments: { energy_100g: 1500, proteins_100g: "7,5" } }));
  assert.equal(kj.k, Math.round(1500 / 4.184));
  assert.equal(kj.p, 7.5);
  assert.equal(defaultAmount(kj), 100);
  assert.equal(defaultAmount({ s: 30 }), 30);
});

test("Kommazahlen und Strings werden gelesen, Unsinn verworfen", () => {
  const p = shapeProduct(off({ product_name: "X", nutriments: { "energy-kcal_100g": "250,5", proteins_100g: "abc" }, serving_quantity: "30,5", product_quantity: "-3" }));
  assert.equal(p.k, 251); assert.equal(p.p, null); assert.equal(p.s, 30.5); assert.equal(p.q, null);
  const big = shapeProduct(off({ product_name: "Y", nutriments: { "energy-kcal_100g": 99999, proteins_100g: 500 }, serving_quantity: 1e9 }));
  assert.equal(big.k, null); assert.equal(big.p, null); assert.equal(big.s, null);
  assert.equal(numIn("12,5", 0, 100), 12.5);
  assert.equal(numIn(NaN, 0, 1), null);
});

test("Schadtext im Namen wird entschärft und gekürzt", () => {
  const p = shapeProduct(off({ product_name: "<img src=x onerror=alert(1)>Müsli" + "x".repeat(300), brands: "<script>alert(1)</script>Marke", nutriments: {} }));
  assert.ok(!/[<>]/.test(p.n));
  assert.ok(p.n.length <= 125);
  assert.equal(cleanText("a\u0000b\nc", 10), "a b c");
});

test("nicht gefunden und kaputte Antworten", () => {
  assert.equal(shapeProduct({ status: 0 }), null);
  assert.equal(shapeProduct(null), null);
  assert.equal(shapeProduct({ product: "x" }), null);
  assert.equal(shapeProduct(off({})).n, "Unbekanntes Produkt");
});

test("Barcode-Nummer wird geprüft", () => {
  assert.equal(validEan("4008400402222"), "4008400402222");
  assert.equal(validEan(" 4008 4004 0222 2 "), "4008400402222");
  assert.equal(validEan("1234567"), "");
  assert.equal(validEan("123456789012345"), "");
  assert.equal(validEan("abc"), "");
  assert.equal(validEan(null), "");
});

test("Rechenlogik für Mengen", () => {
  const a = amountCalc(62, 10.5, 150);
  assert.equal(Math.round(a.k), 93); assert.equal(a.p, 15.75);
  assert.deepEqual(amountCalc(100, 10, 0), { k: 0, p: 0 });
  assert.deepEqual(amountCalc(100, 10, -5), { k: 0, p: 0 });
  assert.deepEqual(amountCalc(null, undefined, 50), { k: 0, p: 0 });
});

test("als Lebensmittel merken: Portion, pro 100 g, Barcode, Rückweg zum Produkt", () => {
  const p = { n: "Arla Skyr Vanille", s: 150, q: 450 };
  const f = foodFromProduct(p, "5760466990087", 62, 10.5);
  assert.equal(f.k, 93); assert.equal(f.p, 15.8); assert.equal(f.k1, 62); assert.equal(f.p1, 10.5); assert.equal(f.g, 150); assert.equal(f.b, "5760466990087"); assert.equal(f.q, 450);
  const back = productFromFood(f);
  assert.equal(back.k, 62); assert.equal(back.p, 10.5); assert.equal(back.s, 150); assert.equal(back.local, 1);
  assert.equal(productFromFood({ n: "alt", k: 100, p: 5 }), null);
  const noBc = foodFromProduct({ n: "Eigenes" }, "", 200, 4);
  assert.equal(noBc.b, undefined); assert.equal(noBc.g, 100); assert.equal(noBc.k, 200);
});

test("Meine Lebensmittel mit Barcode überstehen Sync-Bereinigung, alte Einträge bleiben", () => {
  const f = foodFromProduct({ n: "Skyr", s: 150 }, "5760466990087", 62, 10.5);
  const dy = sanitizeDiary({ foods: [f, { n: "Kantine", k: 450, p: 5 }, { n: "Böse", k: 10, p: 1, b: "<x>", k1: 99999, g: -1 }] });
  assert.equal(dy.foods.length, 3);
  assert.equal(dy.foods[0].b, "5760466990087"); assert.equal(dy.foods[0].k1, 62); assert.equal(dy.foods[0].g, 150);
  assert.deepEqual(dy.foods[1], { n: "Kantine", k: 450, p: 5 });
  assert.equal(dy.foods[2].b, undefined); assert.equal(dy.foods[2].k1, undefined); assert.equal(dy.foods[2].g, undefined);
});

test("Zutat für Mahlzeit kombinieren aus dem Scan", () => {
  const it = mealItemFromProduct({ n: "Skyr", s: 150 }, 62, 10.5, 150);
  assert.equal(itemGrams(it), 150);
  assert.equal(Math.round(itemKcal(it)), 93);
  assert.equal(it.nu, "Portion");
});

test("gemerkte Produkte sind in der Mahlzeit-Suche auffindbar und gewinnen", () => {
  setCustomFoods([{ n: "Arla Skyr Vanille", k1: 62, p1: 10.5, g: 150 }, { n: "alt", k: 1, p: 1 }]);
  assert.ok(matchFoods("Skyr Vanille").some(f => f.n === "Arla Skyr Vanille"));
  assert.equal(matchFoods("Arla Skyr Vanille")[0].n, "Arla Skyr Vanille");
  const r = parseMeal("1 Portion Arla Skyr Vanille");
  assert.equal(itemGrams(r.items[0]), 150);
  assert.equal(Math.round(itemProt(r.items[0]) * 10) / 10, 15.8);
  setCustomFoods([]);
  assert.ok(!/Arla/.test(matchFoods("Skyr")[0].n));
});
