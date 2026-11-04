import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitMeal, parseSegment, parseMeal, matchFoods, sumItems, itemKcal, itemProt, itemGrams,
  amountLabel, mealName, toggleUnit, stepItem, setAmount, rebase, manualItem, storeItem, ALL_FOODS,
} from "../js/meal.js";
import { sanitizeDiary } from "../js/validate.js";

const first = t => parseMeal(t).items[0];

test("Text wird an mit, und, plus und Komma getrennt, Dezimalkomma bleibt", () => {
  assert.deepEqual(splitMeal("1 Scheibe Brot mit Hähnchenaufschnitt"), ["1 Scheibe Brot", "Hähnchenaufschnitt"]);
  assert.deepEqual(splitMeal("2 Scheiben Vollkornbrot, 3 Scheiben Putenbrust, 1 Apfel"), ["2 Scheiben Vollkornbrot", "3 Scheiben Putenbrust", "1 Apfel"]);
  assert.deepEqual(splitMeal("Brot + Butter und Käse"), ["Brot", "Butter", "Käse"]);
  assert.equal(splitMeal("1,5 Scheiben Brot").length, 1);
  assert.deepEqual(splitMeal("Kaffee mit Milch, Ei"), ["Kaffee mit Milch", "Ei"]);
  assert.deepEqual(splitMeal("  "), []);
});

test("Mengen und Einheiten werden erkannt", () => {
  const a = parseSegment("2 Scheiben Vollkornbrot");
  assert.equal(a.n, 2); assert.equal(a.unit, "scheibe"); assert.equal(a.q, "vollkornbrot");
  const b = parseSegment("eine halbe Scheibe Toast");
  assert.equal(b.n, 0.5); assert.equal(b.unit, "scheibe");
  const c = parseSegment("100g Skyr");
  assert.equal(c.n, 100); assert.equal(c.unit, "g"); assert.equal(c.q, "skyr");
  const d = parseSegment("1 EL Honig");
  assert.equal(d.unit, "el"); assert.equal(d.q, "honig");
  const e = parseSegment("1 1/2 Tassen Kaffee");
  assert.equal(e.n, 1.5); assert.equal(e.unit, "tasse");
  const f = parseSegment("Joghurt 150 g");
  assert.equal(f.n, 150); assert.equal(f.unit, "g"); assert.equal(f.q, "joghurt");
  const g = parseSegment("Apfel");
  assert.equal(g.hasN, false); assert.equal(g.q, "apfel");
  assert.equal(parseSegment("zwei Eier").n, 2);
  assert.equal(parseSegment("ca. 2 Glas Milch").unit, "glas");
});

test("Brot mit Hähnchenaufschnitt: zwei Zutaten mit plausiblen Werten", () => {
  const r = parseMeal("1 Scheibe Brot mit Hähnchenaufschnitt");
  assert.equal(r.items.length, 2);
  assert.equal(r.unknown.length, 0);
  const [brot, auf] = r.items;
  assert.match(brot.n, /brot/i);
  assert.equal(itemGrams(brot), 40);
  assert.ok(itemKcal(brot) > 90 && itemKcal(brot) < 110, "Brot kcal " + itemKcal(brot));
  assert.ok(itemProt(brot) > 2.5 && itemProt(brot) < 4.5);
  assert.match(auf.n, /Aufschnitt/);
  assert.equal(itemGrams(auf), 25);
  assert.ok(itemKcal(auf) > 20 && itemKcal(auf) < 32);
  assert.ok(itemProt(auf) > 4 && itemProt(auf) < 6);
  assert.equal(mealName(r.items), "Brot + Hähnchenaufschnitt");
  const t = sumItems(r.items);
  assert.ok(t.k > 115 && t.k < 135);
});

test("mehrere Zutaten mit Stückzahl, Scheiben und Standardmengen", () => {
  const r = parseMeal("2 Scheiben Vollkornbrot, 3 Scheiben Putenbrust, 1 Apfel");
  assert.equal(r.items.length, 3);
  assert.equal(amountLabel(r.items[0]), "2 Scheiben (40 g)");
  assert.equal(itemGrams(r.items[0]), 80);
  assert.equal(itemGrams(r.items[1]), 45);
  assert.match(amountLabel(r.items[2]), /^1 Stück \(\d+ g\)$/);
  assert.equal(itemGrams(first("2 Eier")), 110);
  assert.equal(itemGrams(first("2 Brötchen")), 120);
  assert.equal(itemGrams(first("1 EL Honig")), 25);
  assert.equal(itemGrams(first("1 TL Butter")), 5);
  assert.equal(itemGrams(first("1 Glas Orangensaft")), 200);
  assert.equal(itemGrams(first("150 g Skyr")), 150);
});

test("Belag ohne Menge richtet sich nach der Zahl der Brotscheiben", () => {
  const one = parseMeal("1 Scheibe Brot mit Butter und Käse").items;
  const two = parseMeal("2 Scheiben Brot mit Butter und Käse").items;
  assert.equal(itemGrams(one[1]), 8);
  assert.equal(itemGrams(one[2]), 25);
  assert.equal(itemGrams(two[1]), 16);
  assert.equal(itemGrams(two[2]), 50);
  assert.equal(itemGrams(first("Käse")), 25);
});

test("Synonyme finden das richtige Lebensmittel", () => {
  const want = [
    ["Hähnchenaufschnitt", /Aufschnitt/], ["Hühnerbrust-Aufschnitt", /Hähnchenbrust-Aufschnitt/], ["Aufschnitt", /Aufschnitt/],
    ["Putenbrust", /Putenbrust/], ["Käse", /Käse/], ["Salami", /^Salami/], ["Schinken", /schinken/i],
    ["Semmel", /^Brötchen/], ["Vollkornbrot", /^Vollkornbrot/], ["Toast", /^Toast/], ["Butter", /^Butter/],
    ["Frischkäse", /^Frischkäse/], ["Ei", /^Ei, gekocht/], ["Joghurt", /joghurt/i], ["Brot", /^Mischbrot/], ["Thunfisch", /^Thunfisch/],
  ];
  for (const [q, re] of want) {
    const m = matchFoods(q);
    assert.ok(m.length, q);
    assert.match(m[0].n, re, q + " -> " + m[0].n);
  }
});

test("Tippfehler und zusammengesetzte Wörter werden toleriert", () => {
  assert.match(first("Haehnchenaufschnit").n, /Aufschnitt/);
  assert.match(first("Vollkornbrott").n, /Vollkornbrot/);
  assert.match(first("Mozzarela").n, /Mozzarella/);
});

test("nicht erkannte Teile landen in unknown", () => {
  const r = parseMeal("Xyzqwv mit Brot");
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.unknown.map(u => u.raw), ["Xyzqwv"]);
  assert.equal(parseMeal("").items.length, 0);
  assert.equal(parseMeal("   ,  mit ").items.length, 0);
  assert.equal(parseMeal("3").unknown.length, 1);
});

test("Mengen ändern: Schritt, Eingabe, Einheit umschalten, anderes Lebensmittel", () => {
  const it = first("1 Scheibe Brot");
  stepItem(it, 1);
  assert.equal(it.c, 1.5);
  toggleUnit(it);
  assert.equal(it.ul, "g"); assert.equal(it.c, 60);
  stepItem(it, 1);
  assert.equal(it.c, 70);
  toggleUnit(it);
  assert.equal(it.ul, "Scheibe"); assert.equal(it.c, 1.8);
  setAmount(it, "3");
  assert.equal(itemGrams(it), 120);
  setAmount(it, "-2");
  assert.equal(it.c, 3);
  const t = parseMeal("2 Scheiben Brot").items[0];
  const other = t.alts[1];
  if (other) { const x = rebase(t, other); assert.ok(itemGrams(x) > 0); }
});

test("manuell eingetragene Portion rechnet pro Portion", () => {
  const m = manualItem("Kantinenessen", 450, 20);
  assert.equal(itemKcal(m), 450);
  m.c = 2;
  assert.equal(itemKcal(m), 900);
  assert.equal(itemProt(m), 40);
  const s = sumItems([m, first("100 g Skyr")]);
  assert.ok(s.k > 960 && s.k < 970);
});

test("neue Lebensmittel sind als grob gekennzeichnet und plausibel", () => {
  const extra = ALL_FOODS.filter(f => f.gr);
  assert.ok(extra.length >= 5);
  for (const f of extra) {
    assert.ok(f.k > 0 && f.k < 900 && f.p >= 0 && f.p < 100, f.n);
    assert.ok(f.u.some(u => u[0] === "g"), f.n);
  }
});

test("eigene Mahlzeiten überstehen Bereinigung (Sync und Sicherung)", () => {
  const items = parseMeal("1 Scheibe Brot mit Hähnchenaufschnitt").items.map(storeItem);
  const dy = sanitizeDiary({ meals:[
    { id:"ml1", n:"Mein Frühstück", u:5, items },
    { id:"ml1", n:"doppelt", items },
    { id:"böse id", n:"x", items },
    { id:"ml2", n:"leer", items:[] },
    { id:"ml3", n:"", items },
    { id:"ml4", n:"kaputt", items:[{ n:"a", k:"x", p:1, c:1, ug:1 }, { n:"b", k:100, p:2, c:0, ug:1 }] },
  ] });
  assert.equal(dy.meals.length, 1);
  assert.equal(dy.meals[0].n, "Mein Frühstück");
  assert.equal(dy.meals[0].items.length, 2);
  assert.deepEqual(dy.meals[0].items.map(i => i.n), items.map(i => i.n));
  assert.deepEqual(sanitizeDiary(null).meals, []);
  assert.deepEqual(sanitizeDiary({ days:{} }).meals, []);
});
