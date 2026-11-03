import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { FOODDB } from "../js/data/foods.js";
import { parsePiece, calcPiece, unitCaption } from "../js/nutrition.js";
import { sanitizeDiary } from "../js/validate.js";

const root = path.resolve(import.meta.dirname, "..");

function piece(text){
  const pc = parsePiece(text);
  assert.ok(pc && pc.foods.length, text);
  return calcPiece(pc);
}

test("Einheiten nennen die Menge, g und ml bleiben ohne Klammer", () => {
  assert.equal(unitCaption("g", 1, false), "g");
  assert.equal(unitCaption("ml", 1, true), "ml");
  assert.equal(unitCaption("Scheibe", 25, false), "Scheibe (25 g)");
  assert.equal(unitCaption("Dose", 500, true), "Dose (500 ml)");
  const grams = piece("200 g Skyr");
  assert.equal(grams.label, "200 g");
  assert.equal(grams.g, 200);
  const ml = piece("330 ml Cola");
  assert.equal(ml.label, "330 ml");
  assert.equal(ml.f.n, "Cola");
});

test("Skyr-Becher ist der große Becher, klein und Milbona bleiben wählbar", () => {
  const skyr = FOODDB.find(f => f.n === "Skyr");
  const frucht = FOODDB.find(f => f.n === "Skyr Frucht");
  const milbona = FOODDB.find(f => f.n === "Skyr Natur Milbona / Arla");
  assert.equal(skyr.k, 63);
  assert.equal(skyr.p, 11);
  assert.equal(frucht.k, 75);
  assert.equal(milbona.k, 63);
  const big = piece("1 Becher Skyr");
  assert.equal(big.f.n, "Skyr");
  assert.equal(big.g, 450);
  assert.equal(big.label, "1 Becher (450 g)");
  assert.equal(piece("1 Becher klein Skyr").g, 150);
  assert.equal(piece("1 Becher klein Skyr").label, "1 Becher klein (150 g)");
  assert.equal(piece("Skyr").g, 450);
  const fruit = piece("1 Becher Skyr Frucht");
  assert.equal(fruit.f.n, "Skyr Frucht");
  assert.equal(fruit.g, 450);
  assert.equal(piece("1 Einzelbecher Skyr Erdbeere").g, 150);
  assert.equal(piece("1 Becher Milbona Skyr").g, 450);
  assert.equal(piece("1 Becher groß Arla Skyr").g, 500);
  assert.match(piece("1 Becher groß Arla Skyr").label, /Becher groß \(500 g\)/);
});

test("Getränke und übliche Proteinbecher zeigen die Handelsgröße", () => {
  const monster = piece("1 Dose Monster Ultra White");
  assert.equal(monster.f.n, "Monster Ultra");
  assert.equal(monster.g, 500);
  assert.equal(monster.label, "1 Dose (500 ml)");
  const cola = piece("1 Cola");
  assert.equal(cola.f.n, "Cola");
  assert.equal(cola.g, 330);
  assert.equal(cola.label, "1 Dose (330 ml)");
  const quark = piece("Magerquark");
  assert.equal(quark.f.n, "Magerquark");
  assert.equal(quark.g, 500);
  assert.equal(quark.label, "1 Becher (500 g)");
  assert.equal(FOODDB.find(f => f.n === "Magerquark").k, 67);
  assert.equal(FOODDB.find(f => f.n === "Magerquark").p, 12);
  const speise = piece("Quark");
  assert.equal(speise.f.n, "Quark 20 % (Speisequark)");
  assert.equal(speise.g, 250);
  assert.equal(piece("1 Becher groß Sahnequark").g, 500);
});

test("alte Tagebucheinträge behalten kcal und Eiweiß", () => {
  const old = { n:"Skyr (1 Becher)", k:94.5, p:16.5, m:1 };
  const dy = sanitizeDiary({ days:{ "2026-11-01":[old, { n:"Kaffee", k:2, p:0.2, m:2 }] } });
  const row = dy.days["2026-11-01"][0];
  assert.equal(row.n, "Skyr (1 Becher)");
  assert.equal(row.k, 94.5);
  assert.equal(row.p, 16.5);
  assert.equal(row.m, 1);
  assert.equal(dy.days["2026-11-01"][1].k, 2);
  const fresh = piece("1 Becher Skyr");
  assert.equal(fresh.g, 450);
  assert.ok(Math.abs(fresh.p - row.p) > 1);
  assert.equal(fresh.f.k, 63);
  assert.equal(fresh.f.p, 11);
});

test("Tagebuch und Nährwertmodul bleiben gültiges JavaScript", () => {
  for (const file of ["js/nutrition.js", "js/diary.js", "js/data/foods.js"]) {
    const check = spawnSync(process.execPath, ["--check", file], { cwd: root });
    assert.equal(check.status, 0, file + "\n" + check.stderr);
  }
});
