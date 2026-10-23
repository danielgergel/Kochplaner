import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeField, sanitizeDiary, sanitizeRecipe, macro, sanitizeState } from "../js/validate.js";

test("kcal und Eiweiß werden aus Textzahlen", () => {
  assert.equal(macro("610", 8000), 610);
  assert.equal(macro("12,5", 2000), 12.5);
  assert.equal(macro("keine", 8000), null);
  assert.equal(macro(-4, 8000), null);
});

test("kaputte Rezepte fallen weg, Zahlen werden gerundet", () => {
  const ok = sanitizeRecipe({ id:"X1", n:"Shake", k:"460", p:"39,2", z:["1 EL Erdnussmus"], s:[] });
  assert.equal(ok.k, 460);
  assert.equal(ok.p, 39);
  assert.deepEqual(ok.z, ["1 EL Erdnussmus"]);
  assert.equal(sanitizeRecipe({ id:"??", n:"x", z:["a"] }), null);
  assert.equal(sanitizeRecipe({ id:"X2", n:"", z:["a"] }), null);
  assert.equal(sanitizeRecipe("nein"), null);
});

test("Plan und Tagebuch verwerfen unbrauchbare Einträge", () => {
  const sel = sanitizeField("sel", { F1:1, "kaputt id":2, M2:"3", A1:"viel", P3:0 });
  assert.deepEqual(sel, { F1:1, M2:3 });
  assert.equal(sanitizeField("sel", "nein"), undefined);
  const dy = sanitizeDiary({
    goal:{ k:"2200", p:"150" },
    days:{
      "2026-10-22":[
        { n:"Kaffee", k:"4", p:"0,2", m:1 },
        { n:"", k:10, p:1 },
        { k:10, p:1 },
        "muell",
      ],
      "gestern":[{ n:"x", k:1, p:1 }],
    },
    foods:[{ n:"Skyr", k:"63", p:"11" }, { n:"" }],
  });
  assert.equal(dy.goal.k, 2200);
  assert.equal(dy.goal.p, 150);
  assert.equal(dy.days["2026-10-22"].length, 1);
  assert.equal(dy.days["2026-10-22"][0].k, 4);
  assert.equal(dy.days["2026-10-22"][0].p, 0.2);
  assert.equal(dy.days.gestern, undefined);
  assert.equal(dy.foods.length, 1);
  assert.equal(dy.foods[0].k, 63);
});

test("Sicherung behält nur gültige Felder", () => {
  const st = sanitizeState({
    sel:{ F1:"2" },
    cust:[{ id:"X9", n:"Bowl", k:"1234", p:"40,4", z:["200 g Reis"], s:["Kochen."] }, { id:"", n:"x" }],
    extra:[{ t:"Küchenrolle", d:1 }, { t:"" }],
    plz:"76 133",
    rate:{ F1:2, F2:9 },
  });
  assert.equal(st.sel.F1, 2);
  assert.equal(st.cust.length, 1);
  assert.equal(st.cust[0].k, 1234);
  assert.equal(st.cust[0].p, 40);
  assert.equal(st.extra[0].t, "Küchenrolle");
  assert.equal(st.extra[0].d, true);
  assert.equal(st.plz, "76133");
  assert.deepEqual(st.rate, { F1:2 });
});
