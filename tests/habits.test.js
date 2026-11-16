import test from "node:test";
import assert from "node:assert/strict";
import { findFoods } from "../js/nutrition.js";
import { seedHabits, rankFoods, habitFromEntry, touchHabit, applyHabitPortion, topHabits, habitScore } from "../js/habits.js";
import { sanitizeDiary } from "../js/validate.js";
import { nm } from "../js/util.js";

test("Tagebuch-Historie setzt die gewohnte Variante nach oben", () => {
  const days = {
    "2026-11-01": [{ n: "Kaffee, schwarz (1 Tasse (200 ml))", k: 2, p: 0.2, m: 1 }],
    "2026-11-02": [{ n: "Kaffee mit Milch (2 Tasse (200 ml))", k: 80, p: 4.8, m: 1 }],
    "2026-11-03": [{ n: "Kaffee mit Milch (2 Tasse (200 ml))", k: 80, p: 4.8, m: 1 }],
  };
  const habits = seedHabits(days, {});
  const milk = habitFromEntry(days["2026-11-02"][0]);
  assert.equal(milk.n, "Kaffee mit Milch");
  assert.equal(milk.unit, "Tasse");
  assert.equal(milk.qty, 2);
  const foods = rankFoods(findFoods(nm("kaffee"), 12), nm("kaffee"), habits, Date.parse("2026-11-04T12:00:00"));
  assert.equal(foods[0].n, "Kaffee mit Milch");
  assert.ok(habitScore(habits[nm("Kaffee mit Milch")]) > habitScore(habits[nm("Kaffee, schwarz")]));
  const pc = { q: "kaffee", n: 1, hasN: false, unit: "", foods, fi: 0 };
  applyHabitPortion(pc, habits[nm(foods[0].n)]);
  assert.equal(pc.n, 2);
  assert.equal(pc.unitForce, "Tasse");
});

test("einmal auswählen reicht vor nie benutzten", () => {
  const habits = {};
  touchHabit(habits, { key: nm("Kaffee mit Milch"), n: "Kaffee mit Milch", kind: "food", unit: "Tasse", qty: 1 }, true);
  const foods = rankFoods(findFoods(nm("kaffee"), 12), nm("kaffee"), habits);
  assert.equal(foods[0].n, "Kaffee mit Milch");
  assert.equal(habits[nm("Kaffee, schwarz")], undefined);
  const again = topHabits(habits, 4, 2);
  assert.equal(again.length, 0);
  touchHabit(habits, { key: nm("Kaffee mit Milch"), n: "Kaffee mit Milch", kind: "food" }, true);
  assert.equal(topHabits(habits, 4, 2)[0].n, "Kaffee mit Milch");
});

test("Gewohnheiten überstehen die Tagebuch-Bereinigung", () => {
  const clean = sanitizeDiary({
    goal: { k: 2100, p: 150 },
    habits: {
      "Kaffee mit Milch": { n: "Kaffee mit Milch", c: 4, t: 10, kind: "food", unit: "Tasse", qty: 2, junk: true },
      bad: { n: "", c: 3 },
    },
    habitSeed: 1,
  });
  assert.equal(clean.habitSeed, 1);
  assert.equal(clean.habits["kaffee mit milch"].c, 4);
  assert.equal(clean.habits["kaffee mit milch"].unit, "Tasse");
  assert.equal(clean.habits["kaffee mit milch"].junk, undefined);
  assert.equal(clean.habits.bad, undefined);
});
