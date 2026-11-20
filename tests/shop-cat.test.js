import test from "node:test";
import assert from "node:assert/strict";
import { FL, MI, G, TR } from "../js/data/shop-rules.js";
import { manualCategory, groupManual, GEW, SONST } from "../js/shop-cat.js";

test("Mengen, Plural, Umlaute und Tippfehler landen in der Rezeptkategorie", () => {
  assert.equal(manualCategory("2 Bananen"), G);
  assert.equal(manualCategory("500g hack"), FL);
  assert.equal(manualCategory("500 g Hackfleisch"), FL);
  assert.equal(manualCategory("Hänchen"), FL);
  assert.equal(manualCategory("haehnchenbrust"), FL);
  assert.equal(manualCategory("Äpfel"), G);
  assert.equal(manualCategory("Aepfel"), G);
  assert.equal(manualCategory("MILCH"), MI);
  assert.equal(manualCategory("3 Eier"), MI);
  assert.equal(manualCategory("Tomaten"), G);
  assert.equal(manualCategory("Kartoffeln"), G);
  assert.equal(manualCategory("Brötchen"), TR);
  assert.equal(manualCategory("Toast"), TR);
  assert.equal(manualCategory("Salz"), GEW);
  assert.equal(manualCategory("Pfeffer"), GEW);
  assert.equal(manualCategory("Paprikapulver"), GEW);
  assert.equal(manualCategory("Paprika"), G);
  assert.equal(manualCategory("Küchenrolle"), SONST);
  assert.equal(manualCategory("Spülmittel"), SONST);
  assert.equal(manualCategory("Skyr"), MI);
  assert.equal(manualCategory("Öl"), TR);
});

test("vorhandene manuelle Einträge werden beim Gruppieren neu einsortiert", () => {
  const groups = groupManual([
    { t: "Küchenrolle", d: false },
    { t: "2 Bananen", d: true, at: 10 },
    { t: "Salz", d: false },
    { t: "500g hack", d: false },
    { t: "Äpfel", d: false },
    { t: "Milch", d: false },
  ]);
  const by = Object.fromEntries(groups.map(g => [g.cat, g.rows.map(r => r.t)]));
  assert.deepEqual(by[FL], ["500g hack"]);
  assert.deepEqual(by[MI], ["Milch"]);
  assert.deepEqual(by[G], ["2 Bananen", "Äpfel"]);
  assert.deepEqual(by[GEW], ["Salz"]);
  assert.deepEqual(by[SONST], ["Küchenrolle"]);
  const banane = groups.find(g => g.cat === G).rows.find(r => r.t === "2 Bananen");
  assert.equal(banane.i, 1);
  assert.equal(banane.d, true);
  assert.deepEqual(groups.map(g => g.cat), [FL, MI, G, GEW, SONST]);
});
