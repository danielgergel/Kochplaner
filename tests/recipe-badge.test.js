import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { badgeOf, haystack, idNumber, recipeRank, clearSearchCache, stemSearch } from "../js/recipe-badge.js";
import { loadBuiltinRecipes } from "../js/data/recipes.js";

const cust = [
  { id: "X1761200000002", n: "Skyr mit Beeren" },
  { id: "X1761200000001", n: "Hähnchen-Bowl" },
];

test("eigene Rezepte bekommen X1, X2 nach Erstellzeit, die gespeicherte id bleibt", () => {
  assert.equal(badgeOf("X1761200000001", cust), "X1");
  assert.equal(badgeOf("X1761200000002", cust), "X2");
  assert.equal(cust[0].id, "X1761200000002");
  assert.equal(badgeOf("F12", cust), "F12");
  assert.equal(badgeOf("M3", cust), "M3");
  assert.equal(badgeOf("X999", []), "Eigen");
});

test("Suche findet Name, kurze Nummer und die lange gespeicherte id", () => {
  const r = { id: "X1761200000001", n: "Hähnchen-Bowl" };
  assert.equal(haystack(r, cust).includes("hähnchen-bowl"), true);
  assert.equal(haystack(r, cust).includes("x1"), true);
  assert.equal(haystack(r, cust).includes("x1761200000001"), true);
  assert.equal(haystack(r, cust).includes("xyz"), false);
  assert.equal(haystack({ id: "F4", n: "Porridge" }, cust).includes("f4"), true);
});

test("Suche: mehrere Wörter, Zutaten, Stamm und Synonyme", () => {
  const e6 = loadBuiltinRecipes().E6;
  assert.equal(e6.n, "Nudel-Schafskäse aus dem Airfryer");
  assert.equal(recipeRank(e6, "nudeln feta", []), 0);
  assert.equal(recipeRank(e6, "feta nudeln", []), 0);
  assert.equal(recipeRank(e6, "spaghetti schafskaese", []), 0);
  assert.equal(stemSearch("nudeln"), "nudel");
  assert.equal(stemSearch("tomaten"), "tomat");
  assert.equal(stemSearch("tomate"), "tomat");
  const nameHit = { id: "T1", n: "Tomaten-Salat", z: ["Gurke"] };
  const ingHit = { id: "T2", n: "Sommerbowl", z: ["200 g Tomaten"] };
  assert.equal(recipeRank(nameHit, "tomaten", []), 0);
  assert.equal(recipeRank(ingHit, "tomate", []), 1);
  const custom = { id: "X1", n: "Ofenschale", z: ["150 g Feta"] };
  assert.equal(recipeRank(custom, "schafskäse", []), 1);
  assert.equal(recipeRank({ id: "T4", n: "Hähnchenpfanne", z: [] }, "huhn", []), 0);
  assert.equal(recipeRank({ id: "T6", n: "Pfanne", z: ["Hackfleisch"] }, "hack", []), 1);
  const cached = { id: "T5", n: "Bowl", z: ["Feta"] };
  assert.equal(recipeRank(cached, "feta", []), 1);
  cached.z = ["Reis"];
  assert.equal(recipeRank(cached, "feta", []), 1);
  clearSearchCache();
  assert.equal(recipeRank(cached, "feta", []), -1);
  assert.equal(recipeRank(cached, "reis", []), 1);
  assert.match(haystack(e6, []), /schafskäse/);
  assert.match(haystack(e6, []), /nudeln/);
});

test("Zeitstempel in der id bleiben in Erstellreihenfolge sortierbar", () => {
  const ids = ["X1761234567891", "X1760000000000", "X1761234567890"];
  const sorted = ids.slice().sort((a, b) => idNumber(a) - idNumber(b));
  assert.deepEqual(sorted, ["X1760000000000", "X1761234567890", "X1761234567891"]);
  for (const id of ids) assert.equal(Number.isSafeInteger(idNumber(id)), true);
});

test("Tagebuch: Schnelleintrag steht oben, Wochenbilanz ganz unten", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "../js/diary.js"), "utf8");
  const html = src.slice(src.indexOf("export function dyHtml"), src.indexOf("export function drawDy"));
  const quick = html.indexOf("Schnell eintragen");
  const add = html.indexOf('id="qadd"');
  const field = html.indexOf('id="qk"');
  const preview = html.indexOf('id="qkp"');
  const meal = html.indexOf("Mahlzeit");
  const eaten = html.indexOf("Gegessen");
  const foods = html.indexOf("${foods}");
  const chart = html.indexOf("${weekChartHtml()}");
  assert.ok(quick > 0 && add > quick && field > add && preview > field && meal > preview && eaten > meal && foods > eaten && chart > foods);
  assert.equal(html.indexOf("${weekChartHtml()}"), html.lastIndexOf("${weekChartHtml()}"));
});

test("Wochenbilanz zeichnet zwei Linien, die Tagesliste bleibt", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "../js/diary.js"), "utf8");
  const fn = src.slice(src.indexOf("function lineChart"), src.indexOf("const FOLD"));
  assert.match(fn, /Kalorien der letzten sieben Tage/);
  assert.match(fn, /Eiweiß der letzten sieben Tage/);
  assert.match(fn, /polyline/);
  assert.match(fn, /stroke-dasharray/);
  assert.doesNotMatch(fn, /<rect /);
  assert.match(fn, /class="wk7"/);
  assert.match(fn, /\$\{barHtml\(r\.k, G\.k\)\}/);
  assert.match(fn, /\$\{Math\.round\(r\.k\)\} kcal · \$\{Math\.round\(r\.p\)\} g/);
});
