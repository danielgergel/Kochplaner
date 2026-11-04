import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { entryRecipeId, mergeDayEntries, recipeEntry } from "../js/diary.js";
import { sanitizeDiary } from "../js/validate.js";

const root = path.resolve(import.meta.dirname, "..");
const recipes = [
  { id: "M3", n: "Hähnchen-Reis-Pfanne" },
  { id: "E6", n: "Nudel-Schafskäse aus dem Airfryer" },
  { id: "X1", n: "Skyr mit Beeren" },
  { id: "X2", n: "Skyr mit Beeren" },
];

test("gespeicherte Rezept-id öffnet das Rezept, eine gelöschte id nicht", () => {
  assert.equal(entryRecipeId({ n: "Hähnchen-Reis-Pfanne", rid: "M3" }, recipes), "M3");
  assert.equal(entryRecipeId({ n: "Hähnchen-Reis-Pfanne", rid: "Weg" }, recipes), null);
  assert.equal(entryRecipeId({ n: "Skyr mit Beeren", rid: "X1" }, recipes), "X1");
});

test("ohne id zählt nur ein exakter, eindeutiger Rezeptname", () => {
  assert.equal(entryRecipeId({ n: "Hähnchen-Reis-Pfanne" }, recipes), "M3");
  assert.equal(entryRecipeId({ n: "  Nudel-Schafskäse aus dem Airfryer  " }, recipes), "E6");
  assert.equal(entryRecipeId({ n: "hähnchen-reis-pfanne" }, recipes), null);
  assert.equal(entryRecipeId({ n: "Skyr mit Beeren" }, recipes), null);
  assert.equal(entryRecipeId({ n: "Kaffee" }, recipes), null);
  assert.equal(entryRecipeId({ n: "Hähnchen-Reis-Pfanne extra" }, recipes), null);
  assert.equal(entryRecipeId(null, recipes), null);
});

test("neue Rezepteinträge speichern die id, alte Tagebuchdaten bleiben gültig", () => {
  assert.deepEqual(recipeEntry({ id: "M3", n: "Hähnchen-Reis-Pfanne", k: 480, p: 42 }), {
    n: "Hähnchen-Reis-Pfanne", k: 480, p: 42, rid: "M3",
  });
  assert.equal(recipeEntry({ id: "M3", n: "Hähnchen-Reis-Pfanne", k: 480, p: 42 }, { gk: 1 }).gk, 1);
  const dy = sanitizeDiary({
    days: {
      "2026-11-02": [
        { n: "Hähnchen-Reis-Pfanne", k: 480, p: 42, m: 1, rid: "M3", gk: 1 },
        { n: "Kaffee", k: "4", p: "0,2", m: 1 },
        { n: "Alt", k: 10, p: 1, rid: "keine id" },
      ],
    },
  });
  assert.equal(dy.days["2026-11-02"][0].rid, "M3");
  assert.equal(dy.days["2026-11-02"][0].gk, 1);
  assert.equal(dy.days["2026-11-02"][1].rid, undefined);
  assert.equal(dy.days["2026-11-02"][1].n, "Kaffee");
  assert.equal(dy.days["2026-11-02"][2].rid, undefined);
});

test("Sync ergänzt die Rezept-id, ohne den Eintrag zu verdoppeln", () => {
  const local = [{ n: "Pfanne", k: 400, p: 30, m: 1 }];
  const incoming = [{ n: "Pfanne", k: 400, p: 30, m: 1, rid: "M3", gk: 1 }, { n: "Kaffee", k: 4, p: 0, m: 1 }];
  const merged = mergeDayEntries(local, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].rid, "M3");
  assert.equal(merged[0].gk, 1);
  assert.equal(merged[1].n, "Kaffee");
  assert.equal(local[0].rid, undefined);
  const kept = mergeDayEntries([{ n: "Pfanne", k: 400, p: 30, m: 1, rid: "M3" }], [{ n: "Pfanne", k: 400, p: 30, m: 1, rid: "E6" }]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].rid, "M3");
});

test("Essenszeile öffnet das Rezept, Menge und Löschen bleiben eigene Knöpfe", () => {
  const src = fs.readFileSync(path.join(root, "js/diary.js"), "utf8");
  assert.match(src, /data-dyopen=/);
  assert.match(src, /openRecipe\(d\.dyopen,\s*"Y"\)/);
  assert.match(src, /data-dym="\$\{i\}:-0\.5"/);
  assert.match(src, /data-dyx="\$\{i\}"/);
  assert.match(src, /recipeEntry\(r,\s*\{\s*gk:\s*1\s*\}\)/);
  assert.match(src, /addEntry\(recipeEntry\(r\)\)/);
  const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
  assert.match(css, /\.ent \.dyopen/);
  assert.match(css, /var\(--muted\)/);
  for (const file of ["js/diary.js", "js/sync.js"]) {
    const check = spawnSync(process.execPath, ["--check", file], { cwd: root });
    assert.equal(check.status, 0, file + "\n" + check.stderr);
  }
});
