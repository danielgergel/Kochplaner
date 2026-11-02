import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { toPublicRecipe, sanitizeIncoming, importLocal, alreadyImported, validUsername, publicKeysOk } from "../js/share.js";
import { sanitizeRecipe, sanitizeState } from "../js/validate.js";
import { detectDiet } from "../js/diet.js";
import { loadBuiltinRecipes } from "../js/data/recipes.js";

test("geteilte Rezepte sind nur Text und lassen sich unabhängig importieren", () => {
  assert.equal(validUsername("anna_kocht"), true);
  assert.equal(validUsername("Ab"), false);
  assert.equal(validUsername("a"), false);
  assert.equal(validUsername("name mit leerzeichen"), false);
  const pub = toPublicRecipe({
    id: "X1", n: "Linsensuppe", c: "Hauptmahlzeit (16 Uhr)", k: 400, p: 22, t: "20 Min",
    z: ["100 g Linsen", "1 Zwiebel"], s: ["Köcheln lassen."], note: "Mild.",
    image: "data:image/png;base64,aaaa", url: "https://example.test/bild.jpg",
  }, true, 1000);
  assert.equal(publicKeysOk(pub), true);
  assert.equal(pub.veg, true);
  assert.equal(pub.u, 1000);
  assert.equal(pub.image, undefined);
  assert.equal(pub.url, undefined);
  const local = importLocal(pub, "anna_kocht", 42);
  assert.equal(local.id, "X42");
  assert.equal(local.cust, 1);
  assert.match(local.note, /^von anna_kocht/);
  assert.equal(local.from, "anna_kocht");
  assert.equal(local.src, "X1");
  assert.equal(alreadyImported([local], "anna_kocht", "X1"), true);
  assert.equal(alreadyImported([local], "anna_kocht", "X2"), false);
  const stored = sanitizeRecipe(local);
  assert.equal(stored.from, "anna_kocht");
  assert.equal(stored.src, "X1");
  assert.equal(sanitizeIncoming(Object.assign({}, pub, { gone: true })).gone, true);
});

test("Sicherung behält den Benutzernamen, der Haushalt bekommt ihn nicht als Pflicht", () => {
  const st = sanitizeState({ nick: "anna_kocht", shareToken: "a".repeat(32), share: { X1: 1, "böse": 1 }, imports: { "anna_kocht/X1": "X9", "nope": "X1" } });
  assert.equal(st.nick, "anna_kocht");
  assert.equal(st.shareToken.length, 32);
  assert.deepEqual(st.share, { X1: 1 });
  assert.deepEqual(st.imports, { "anna_kocht/X1": "X9" });
  assert.equal(sanitizeState({}).nick, "");
});

test("Regeln trennen öffentliches Lesen und den Schreibschlüssel", () => {
  const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/shares\/\{name\}\/recipes\/\{id\}/);
  assert.match(rules, /match \/secrets\/\{name\}/);
  assert.match(rules, /allow read: if false/);
  assert.match(rules, /match \/households\/\{code\}/);
  assert.match(rules, /match \/diaries\/\{code\}/);
  assert.match(rules, /allow read: if userName\(name\)/);
});

test("E11 bleibt vegetarisch, weil das Hähnchen nur verneint wird", () => {
  const e11 = loadBuiltinRecipes().E11;
  assert.equal(detectDiet(e11.z), "vegetarisch");
  assert.match(e11.z.join(" "), /ohne Hähnchen/);
});
