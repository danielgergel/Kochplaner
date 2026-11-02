import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { diceResult, setDiceResult, openFromPanel, takeBehind, panelBehind, panelClosed, resetPanelReturn } from "../js/panel-return.js";

const root = path.resolve(import.meta.dirname, "..");

test("Würfelergebnis bleibt, wenn man das Rezept öffnet und zurückgeht", () => {
  resetPanelReturn();
  setDiceResult("E6");
  assert.equal(openFromPanel("D"), "D");
  assert.equal(panelBehind(), "D");
  assert.equal(takeBehind(), "D");
  assert.equal(panelBehind(), null);
  assert.equal(diceResult(), "E6");
});

test("Neu-Würfeln ersetzt das Ergebnis, Schließen des Würfel-Panels verwirft es", () => {
  resetPanelReturn();
  setDiceResult("E6");
  setDiceResult("M3");
  assert.equal(diceResult(), "M3");
  openFromPanel("D");
  panelClosed("D");
  assert.equal(diceResult(), null);
  assert.equal(panelBehind(), null);
  assert.equal(takeBehind(), null);
});

test("Kühlschrank und Tagebuch kehren zurück, ohne das Würfelergebnis zu löschen", () => {
  resetPanelReturn();
  setDiceResult("F2");
  assert.equal(openFromPanel("F"), "F");
  assert.equal(takeBehind(), "F");
  assert.equal(diceResult(), "F2");
  assert.equal(openFromPanel("Y"), "Y");
  panelClosed("C");
  assert.equal(panelBehind(), "Y");
  assert.equal(diceResult(), "F2");
  assert.equal(takeBehind(), "Y");
});

test("Rezept aus der Liste stellt kein Panel wieder her", () => {
  resetPanelReturn();
  setDiceResult("E6");
  openFromPanel("D");
  assert.equal(openFromPanel(undefined), null);
  assert.equal(takeBehind(), null);
  assert.equal(diceResult(), "E6");
  panelClosed("F");
  assert.equal(diceResult(), "E6");
  setDiceResult("");
  assert.equal(diceResult(), null);
});

test("Rezept aus Würfeln, Kühlschrank und Tagebuch schließt das Panel nicht vorher", () => {
  const recipes = fs.readFileSync(path.join(root, "js/recipes.js"), "utf8");
  const diary = fs.readFileSync(path.join(root, "js/diary.js"), "utf8");
  assert.match(recipes, /openRecipe\(d\.do,\s*"D"\)/);
  assert.match(recipes, /openRecipe\(d\.fo,\s*"F"\)/);
  assert.match(recipes, /takeBehind\(\)/);
  assert.match(recipes, /setDiceResult\(fin\.id\)/);
  assert.match(diary, /openRecipe\(d\.sgopen,\s*"Y"\)/);
  assert.match(diary, /opts\.keep/);
  assert.doesNotMatch(recipes, /closePanel\(\);\s*openRecipe\(d\.do/);
  assert.doesNotMatch(recipes, /closePanel\(\);\s*openRecipe\(d\.fo/);
  assert.doesNotMatch(diary, /closePanel\(\);\s*ui\.openRecipe/);
});
