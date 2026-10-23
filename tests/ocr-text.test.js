import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLine, parseRecipeText, textFromRecognition, normalizeAmount } from "../js/ocr-text.js";

test("hängt Einheiten ab und behält echte Zutaten", () => {
  assert.equal(normalizeAmount("1EL Erdnussmus"), "1 EL Erdnussmus");
  assert.equal(normalizeAmount("200g Haferflocken"), "200 g Haferflocken");
  assert.equal(cleanLine("1EL Erdnussmus"), "1 EL Erdnussmus");
});

test("verwirft die Beispiel-Müllzeile aus der Texterkennung", () => {
  assert.equal(cleanLine('EZI BEN X w"xBY ne'), null);
  assert.equal(cleanLine("qwerty zxcv !!!"), null);
});

test("Rezepttext: Zutaten bleiben, Unsinn fällt weg", () => {
  const raw = [
    "Erdnuss-Shake",
    "Zutaten",
    "1EL Erdnussmus",
    'EZI BEN X w"xBY ne',
    "200g Haferflocken",
    "1 Banane",
    "Zubereitung",
    "Alles mixen.",
    "qwerty zxcv !!!",
  ].join("\n");
  const r = parseRecipeText(raw);
  assert.equal(r.n, "Erdnuss-Shake");
  assert.deepEqual(r.z, ["1 EL Erdnussmus", "200 g Haferflocken", "1 Banane"]);
  assert.ok(r.s.some(s => s.includes("Alles mixen")));
  assert.ok(r.dropped.some(l => l.includes("EZI")));
});

test("Wörter unter der Vertrauensgrenze fallen weg, sichere Zutat bleibt", () => {
  const data = {
    lines: [
      { text: "1EL Erdnussmus", confidence: 90, words: [
        { text: "1EL", confidence: 92 },
        { text: "Erdnussmus", confidence: 88 },
      ]},
      { text: 'EZI BEN X w"xBY ne', confidence: 18, words: [
        { text: "EZI", confidence: 20 },
        { text: "BEN", confidence: 15 },
        { text: 'w"xBY', confidence: 12 },
        { text: "ne", confidence: 22 },
      ]},
    ],
  };
  const out = textFromRecognition(data);
  assert.deepEqual(out.lines, ["1 EL Erdnussmus"]);
  assert.ok(out.dropped.length >= 1);
});
