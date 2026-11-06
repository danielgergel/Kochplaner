import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prepFromAi, stepsFromAi, parsedWithAi, deviceGuess, AI_NOTE, stripSocial, linkOnlyPaste, nutritionChoice, composeAiNote, aiMarks, LINK_HINT } from "../js/ai-recipe.js";
import { parseRecipeText } from "../js/ocr-text.js";
import { estimateRecipe } from "../js/nutrition.js";
import worker, { corsHeaders } from "../ai-worker/worker.js";

const root = path.resolve(import.meta.dirname, "..");
const local = { n: "Lokal", z: ["200 g Reis"], s: [], t: "", k: "", p: "", portions: 0, dropped: ["Müll"] };

test("KI-Zutaten werden geprüft, kaputtes JSON fällt auf den lokalen Parser zurück", () => {
  const good = prepFromAi({
    name: "Hähnchen",
    portionen: 2,
    zutaten: [
      { menge: "200", einheit: "g", zutat: "Hähnchenbrust" },
      { menge: "", einheit: "", zutat: "Salz" },
      { menge: "1", einheit: "TL", zutat: "x".repeat(200) },
    ],
    schritte: ["Kurz anbraten."],
  });
  assert.equal(good.n, "Hähnchen");
  assert.deepEqual(good.z, ["200 g Hähnchenbrust", "Salz"]);
  assert.equal(good.s[0], "Kurz anbraten.");
  assert.equal(prepFromAi({ name: "x", zutaten: [] }), null);
  assert.equal(prepFromAi({ name: "x", zutaten: "nein" }), null);
  assert.equal(prepFromAi(null), null);
  const remote = { name: "Aus der KI", portionen: 4, zutaten: [{ menge: "1", einheit: "Dose", zutat: "Kichererbsen" }], schritte: [] };
  assert.equal(parsedWithAi(local, remote, false).n, "Lokal");
  assert.deepEqual(parsedWithAi(local, remote, false).z, ["200 g Reis"]);
  const merged = parsedWithAi(local, remote, true);
  assert.equal(merged.n, "Aus der KI");
  assert.deepEqual(merged.z, ["1 Dose Kichererbsen"]);
  assert.equal(parsedWithAi(local, { zutaten: [{ zutat: "" }] }, true).n, "Lokal");
});

test("Anleitung braucht Temperatur und Zeit, das Gerät folgt aus dem Namen", () => {
  const ok = stepsFromAi({ schritte: ["Airfryer auf 180 °C vorheizen.", "12 min garen, einmal wenden."] });
  assert.equal(ok.length, 2);
  assert.equal(stepsFromAi({ schritte: ["Nur rühren ohne Zahlen hier drin.", "Noch ein Satz ohne Maß."] }), null);
  assert.equal(stepsFromAi({ schritte: ["180 °C."] }), null);
  assert.equal(deviceGuess("Hähnchen aus dem Airfryer", ["Salz"]), "Airfryer");
  assert.equal(deviceGuess("Ofenkartoffel", []), "Ofen");
  assert.equal(deviceGuess("Pfanne", ["anbraten"]), "Pfanne");
  assert.equal(deviceGuess("Reis", ["200 g Reis"]), "Airfryer");
  assert.match(AI_NOTE, /KI/);
});

test("Bildunterschrift verliert Hashtags und Werbung, ein nackter Link wird nicht abgerufen", () => {
  const caption = [
    "High Protein Hähnchen aus dem Airfryer 🔥",
    "200g Hähnchenbrust",
    "Salz",
    "Pfeffer",
    "#reels #highprotein #ad",
    "Link in Bio für das Gewürz!",
    "https://www.instagram.com/reel/ABC123/",
  ].join("\n");
  assert.equal(linkOnlyPaste("https://www.instagram.com/reel/ABC123/"), true);
  assert.equal(linkOnlyPaste(caption), false);
  assert.equal(LINK_HINT.includes("Beschreibung"), true);
  const cleaned = stripSocial(caption);
  assert.equal(cleaned.includes("#"), false);
  assert.equal(/https?:/i.test(cleaned), false);
  assert.equal(/link in bio/i.test(cleaned), false);
  const r = parseRecipeText(cleaned);
  assert.ok(r.z.some(z => /Hähnchenbrust/.test(z)));
  assert.ok(r.z.some(z => /Salz/.test(z)));
  assert.ok(r.z.some(z => /Pfeffer/.test(z)));
  const localNut = estimateRecipe(["200 g Reis"], []);
  assert.ok(localNut.found > 0);
  const prefer = nutritionChoice(localNut, { kcal: 999, eiweiss: 99 });
  assert.equal(prefer.from, "local");
  assert.notEqual(prefer.k, "999");
  assert.equal(nutritionChoice({ found: 0, k: 0, p: 0 }, { kcal: 480, eiweiss: 42 }).from, "ki");
  const marks = aiMarks({ z: [], s: ["kurz"] }, { z: ["200 g Reis"], s: ["180 °C, 12 min."] });
  assert.equal(marks.z, true);
  assert.equal(marks.s, true);
  assert.equal(composeAiNote("", { steps: true, ingredients: true }), "Anleitung von KI erstellt. Zutatenmengen von KI geschätzt.");
});

test("Worker beantwortet OPTIONS ohne Body und lehnt fremde Origins ab", async () => {
  const headers = corsHeaders("https://danielgergel.github.io");
  const opt = new Response(null, { status: 204, headers });
  assert.equal(opt.status, 204);
  assert.equal(await opt.text(), "");
  assert.equal(opt.headers.get("access-control-allow-origin"), "https://danielgergel.github.io");
  const live = await worker.fetch(new Request("https://kochplaner-ki.example/aufbereiten", {
    method: "OPTIONS",
    headers: { Origin: "https://danielgergel.github.io" },
  }));
  assert.equal(live.status, 204);
  assert.equal(await live.text(), "");
  assert.equal(live.headers.get("access-control-allow-origin"), "https://danielgergel.github.io");
  const other = await worker.fetch(new Request("https://kochplaner-ki.example/aufbereiten", {
    method: "OPTIONS",
    headers: { Origin: "https://example.com" },
  }));
  assert.equal(other.status, 204);
  assert.equal(other.headers.get("access-control-allow-origin"), null);
  const big = await worker.fetch(new Request("https://kochplaner-ki.example/aufbereiten", {
    method: "POST",
    headers: { Origin: "https://danielgergel.github.io", "content-type": "application/json", "CF-Connecting-IP": "size-test" },
    body: JSON.stringify({ text: "x".repeat(9000) }),
  }));
  assert.equal(big.status, 413);
  const nokey = await worker.fetch(new Request("https://kochplaner-ki.example/aufbereiten", {
    method: "POST",
    headers: { Origin: "https://danielgergel.github.io", "content-type": "application/json", "CF-Connecting-IP": "key-test" },
    body: JSON.stringify({ text: "1/2 TL Salz\nPfeffer\n200 g Hähnchen" }),
  }), {});
  assert.equal(nokey.status, 503);
  const data = await nokey.json();
  assert.equal(data.error, "ki");
  assert.equal(JSON.stringify(data).includes("Salz"), false);
  const missing = await worker.fetch(new Request("https://kochplaner-ki.example/zutaten", {
    method: "POST",
    headers: { Origin: "https://danielgergel.github.io", "content-type": "application/json", "CF-Connecting-IP": "zutat-leer" },
    body: JSON.stringify({ name: "Pfanne", schritte: [] }),
  }));
  assert.equal(missing.status, 400);
  const zutaten = await worker.fetch(new Request("https://kochplaner-ki.example/zutaten", {
    method: "POST",
    headers: { Origin: "https://danielgergel.github.io", "content-type": "application/json", "CF-Connecting-IP": "zutat-key" },
    body: JSON.stringify({ name: "Hähnchen", schritte: ["Im Airfryer bei 180 °C 12 min garen."] }),
  }), {});
  assert.equal(zutaten.status, 503);
});

test("OCR, KI-Modul und Worker bleiben gültiges JavaScript", () => {
  for (const file of ["js/ocr-text.js", "js/ocr.js", "js/ai-recipe.js", "js/recipes.js", "ai-worker/worker.js"]) {
    const check = spawnSync(process.execPath, ["--check", file], { cwd: root });
    assert.equal(check.status, 0, file + "\n" + check.stderr);
  }
});
