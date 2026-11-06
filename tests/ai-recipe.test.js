import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prepFromAi, stepsFromAi, parsedWithAi, deviceGuess, AI_NOTE, AI_BASE, visionImages, screenshotRoute, BILD_MAX } from "../js/ai-recipe.js";
import worker, { corsHeaders, extractJson } from "../ai-worker/worker.js";

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
});

test("Bild-KI: nur jpeg, png und webp, höchstens drei, zusammen unter 4 MB", () => {
  const png = "data:image/png;base64,aaaa";
  const jpeg = "data:image/jpeg;base64,bbbb";
  assert.deepEqual(visionImages([png, jpeg]), [png, jpeg]);
  assert.equal(visionImages([]), null);
  assert.equal(visionImages([png, png, png, png]), null);
  assert.equal(visionImages(["data:image/gif;base64,aaaa"]), null);
  assert.equal(visionImages(["https://example.com/a.png"]), null);
  const huge = "data:image/png;base64," + "a".repeat(BILD_MAX);
  assert.equal(visionImages([huge]), null);
  assert.equal(screenshotRoute(true), "bild");
  assert.equal(screenshotRoute(false), "ocr");
  assert.equal(AI_BASE, "https://kochplaner-ki.danielgergel.workers.dev");
  const wrapped = extractJson("Hier das Rezept:\n```json\n{\"name\":\"Salat\",\"portionen\":2,\"zutaten\":[{\"menge\":\"1/2\",\"einheit\":\"TL\",\"zutat\":\"Salz\"},{\"menge\":\"\",\"einheit\":\"\",\"zutat\":\"Pfeffer\"}],\"schritte\":[]}\n```");
  const clean = prepFromAi(wrapped);
  assert.equal(clean.n, "Salat");
  assert.ok(clean.z.some(z => z.includes("Salz")));
  assert.ok(clean.z.some(z => z.includes("Pfeffer")));
  assert.equal(extractJson("kein json"), null);
});

test("Worker /bild prüft die Bilder und fällt ohne Schlüssel auf den Fehler zurück", async () => {
  const okImg = "data:image/png;base64,aaaa";
  const bad = await worker.fetch(new Request("https://kochplaner-ki.example/bild", {
    method: "POST",
    headers: { Origin: "https://danielgergel.github.io", "content-type": "application/json", "CF-Connecting-IP": "bild-bad" },
    body: JSON.stringify({ bilder: ["data:image/gif;base64,aaaa"] }),
  }));
  assert.equal(bad.status, 400);
  const nokey = await worker.fetch(new Request("https://kochplaner-ki.example/bild", {
    method: "POST",
    headers: { Origin: "https://danielgergel.github.io", "content-type": "application/json", "CF-Connecting-IP": "bild-key" },
    body: JSON.stringify({ bilder: [okImg, okImg] }),
  }), {});
  assert.equal(nokey.status, 503);
  const data = await nokey.json();
  assert.equal(data.error, "ki");
  assert.equal(JSON.stringify(data).includes("aaaa"), false);
});

test("OCR, KI-Modul und Worker bleiben gültiges JavaScript", () => {
  for (const file of ["js/ocr-text.js", "js/ocr.js", "js/ai-recipe.js", "js/recipes.js", "ai-worker/worker.js"]) {
    const check = spawnSync(process.execPath, ["--check", file], { cwd: root });
    assert.equal(check.status, 0, file + "\n" + check.stderr);
  }
});
