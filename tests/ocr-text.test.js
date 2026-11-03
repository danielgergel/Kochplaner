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

test("Brüche, OCR-Fehlleser und Gewürze ohne Menge bleiben Zutaten", () => {
  const raw = [
    "Hähnchen aus dem Airfryer",
    "asdfgh qwerty !!!",
    "1/2 TL Salz",
    "112 TL Kreuzkümmel",
    "V2 EL Paprika",
    "l/2 TL Öl",
    "1 1/2 EL Öl",
    "Pfeffer",
    "Salz",
    "etwas Paprikapulver",
    "1 Prise Zucker",
    "½ TL Kreuzkümmel",
    "1 Pck Backpulver",
    "1 Bund Petersilie",
    "2 Zehen Knoblauch",
    "Salz nach Geschmack",
    'EZI BEN X w"xBY ne',
    "112 g Hähnchenbrust",
    "200g Reis",
    "Zubereitung",
    "Bei 180 Grad 12 Minuten im Airfryer garen.",
  ].join("\n");
  const r = parseRecipeText(raw);
  assert.ok(r.z.includes("0,5 TL Salz"));
  assert.ok(r.z.includes("0,5 TL Kreuzkümmel"));
  assert.ok(r.z.includes("0,5 EL Paprika"));
  assert.ok(r.z.includes("0,5 TL Öl"));
  assert.ok(r.z.includes("1,5 EL Öl"));
  assert.ok(r.z.includes("Pfeffer"));
  assert.ok(r.z.includes("Salz"));
  assert.ok(r.z.includes("etwas Paprikapulver"));
  assert.ok(r.z.includes("1 Prise Zucker"));
  assert.ok(r.z.some(z => z.includes("Kreuzkümmel") && z.startsWith("0,5 TL")));
  assert.ok(r.z.includes("1 Pck Backpulver"));
  assert.ok(r.z.includes("1 Bund Petersilie"));
  assert.ok(r.z.includes("2 Zehen Knoblauch"));
  assert.ok(r.z.includes("Salz nach Geschmack"));
  assert.ok(r.z.includes("112 g Hähnchenbrust"));
  assert.ok(r.z.includes("200 g Reis"));
  assert.ok(r.s.some(s => /180/.test(s) && /Airfryer/.test(s)));
  assert.ok(r.dropped.some(l => l.includes("EZI") || l.includes("qwerty") || l.includes("asdfgh")));
  assert.equal(cleanLine("qwerty zxcv !!!"), null);
  assert.equal(normalizeAmount("112 g Mehl"), "112 g Mehl");
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
