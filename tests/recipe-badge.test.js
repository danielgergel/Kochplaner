import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { badgeOf, haystack, idNumber } from "../js/recipe-badge.js";

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
  const eaten = html.indexOf("Gegessen");
  const foods = html.indexOf("${foods}");
  const chart = html.indexOf("${weekChartHtml()}");
  assert.ok(quick > 0 && eaten > quick && foods > eaten && chart > foods);
  assert.equal(html.indexOf("${weekChartHtml()}"), html.lastIndexOf("${weekChartHtml()}"));
});
