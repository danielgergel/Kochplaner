import test from "node:test";
import assert from "node:assert/strict";
import { buildProfile, cleanProfile, profileText, ideasFromAi, trackBuy, topBuys, buyKey, shopLines, diaryAverage, profileUsable } from "../js/ideas-ai.js";
import { sanitizeRecipe, sanitizeExtra } from "../js/validate.js";
import { manualCategory } from "../js/shop-cat.js";
import worker from "../ai-worker/worker.js";

test("Einkaufsgewohnheiten zählen gleiche Artikel zusammen", () => {
  const m = {};
  trackBuy(m, "Tomaten", 1e12);
  trackBuy(m, "2 Tomaten", 1e12 + 1);
  trackBuy(m, "Tomaten (500 g)", 1e12 + 2);
  trackBuy(m, "Mozzarella", 1e12 + 3);
  assert.equal(buyKey("Tomaten (500 g)"), "tomaten");
  const top = topBuys(m, 5);
  assert.equal(top[0].c, 3);
  assert.equal(top[0].n, "Tomaten");
  assert.equal(top[1].n, "Mozzarella");
});

test("Profil enthält Gewohnheiten, Einkauf, Schnitt und vorhandene Rezepte", () => {
  const days = {
    "2026-11-20": [{ n: "Kaffee mit Milch", k: 40, p: 2, m: 2 }],
    "2026-11-21": [{ n: "Hähnchenbrust", k: 600, p: 100, m: 1 }],
    "2026-11-24": [{ n: "Heute", k: 5000, p: 0, m: 1 }],
  };
  assert.deepEqual(diaryAverage(days, "2026-11-24"), { kcal: 340, eiweiss: 52, tage: 2 });
  const buys = {};
  for (let i = 0; i < 4; i++) trackBuy(buys, "Mozzarella");
  const p = buildProfile({
    frequent: [{ n: "Kaffee mit Milch und Zucker", c: 30 }, { n: "Kartoffeln Airfryer", c: 12 }],
    days, today: "2026-11-24", goal: { k: 2100, p: 150 },
    shopping: ["Tomaten", "Tomaten (500 g)", "Basilikum"], buys,
    recipes: ["Caprese Salat", "caprese salat"], liked: ["Chili con Carne"], wish: "was mit Reis",
  });
  assert.deepEqual(p.einkauf, ["Tomaten", "Basilikum"]);
  assert.equal(p.gekauft[0], "Mozzarella (4×)");
  assert.equal(p.rezepte.length, 1);
  assert.ok(profileUsable(p));
  const clean = cleanProfile(JSON.parse(JSON.stringify(p)));
  const text = profileText(clean);
  assert.match(text, /Kaffee mit Milch und Zucker \(30×\)/);
  assert.match(text, /Einkaufsliste: Tomaten; Basilikum/);
  assert.match(text, /NICHT nochmal vorschlagen: Caprese Salat/);
  assert.match(text, /Ziel|Tagesziel: 2100 kcal, 150 g Eiweiß/);
  assert.equal(cleanProfile({ oft: [], einkauf: [] }), null);
  assert.equal(cleanProfile("x"), null);
});

test("KI-Rezepte werden geprüft, Dubletten und Müll fallen weg", () => {
  const good = { name: "Caprese-Hähnchen aus dem Airfryer", warum: "Du kaufst oft Tomaten und Mozzarella.", art: "Hauptmahlzeit", zeit: "25 Min.", airfryer: true, kcal: "520", eiweiss: 55,
    zutaten: [{ menge: 400, einheit: "g", zutat: "Hähnchenbrust" }, { menge: "125", einheit: "g", zutat: "Mozzarella light" }, "2 Tomaten", { menge: "", einheit: "", zutat: "Salz, Pfeffer" }],
    schritte: ["Hähnchen würzen.", "Im Airfryer bei 190 °C 15 Min. garen."] };
  const list = ideasFromAi({ rezepte: [good, Object.assign({}, good), { name: "Caprese Salat", zutaten: ["1", "2"], schritte: ["x"], kcal: 300, eiweiss: 10 }, { name: "<b>", kcal: 1 }] }, ["Caprese Salat"]);
  assert.equal(list.length, 1);
  const x = list[0];
  assert.equal(x.kcal, 520);
  assert.deepEqual(x.z.slice(0, 3), ["400 g Hähnchenbrust", "125 g Mozzarella light", "2 Tomaten"]);
  assert.equal(ideasFromAi({ rezepte: [] }), null);
  assert.equal(ideasFromAi(null), null);
  const rec = sanitizeRecipe({ id: "X1732400000000", n: x.name, c: "Hauptmahlzeit (16 Uhr)", k: x.kcal, p: x.eiweiss, t: x.zeit, z: x.z, s: x.s, ns: true, pt: "für 2 Personen", cust: 1, note: "Rezeptidee von der KI." });
  assert.ok(rec);
  assert.equal(rec.z.length, 4);
  const shop = shopLines(x.z);
  assert.deepEqual(shop, ["Hähnchenbrust (400 g)", "Mozzarella light (125 g)", "Tomaten (2)"]);
  assert.equal(sanitizeExtra(shop.map(t => ({ t, d: false }))).length, 3);
  assert.equal(manualCategory(shop[0]), "Fleisch & Wurst");
  assert.equal(manualCategory(shop[1]), "Milchprodukte & Eier");
  assert.equal(manualCategory(shop[2]), "Gemüse & Obst");
});

test("Worker: /rezeptideen prüft Eingaben und braucht den Schlüssel", async () => {
  const post = body => worker.fetch(new Request("https://kochplaner-ki.example/rezeptideen", { method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "t-ideas" }, body: JSON.stringify(body) }), {});
  const bad = await post({ profil: { oft: [] } });
  assert.equal(bad.status, 400);
  const nokey = await post({ profil: { oft: ["Kaffee (3×)"], einkauf: ["Tomaten"] } });
  assert.equal(nokey.status, 503);
});

test("Worker: /rezeptideen liefert geprüfte Rezepte", async () => {
  const orig = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ rezepte: [
      { name: "Tomaten-Mozzarella-Omelett", warum: "Passt zu deinem Einkauf.", art: "Frühstück", zeit: "15 Min.", kcal: 380, eiweiss: 32, zutaten: ["4 Eier", "125 g Mozzarella", "2 Tomaten"], schritte: ["Eier verquirlen.", "In der Pfanne stocken lassen."] },
    ] }) } }] }), { status: 200 });
  };
  try {
    const res = await worker.fetch(new Request("https://kochplaner-ki.example/rezeptideen", { method: "POST", headers: { "CF-Connecting-IP": "t-ideas2" }, body: JSON.stringify({ profil: { oft: ["Rührei (5×)"], einkauf: ["Tomaten", "Mozzarella"], rezepte: ["Rührei"] } }) }), { GROQ_API_KEY: "k" });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.rezepte[0].name, "Tomaten-Mozzarella-Omelett");
    assert.equal(out.rezepte[0].art, "Frühstück");
    const again = ideasFromAi(out, ["Rührei"]);
    assert.equal(again.length, 1);
    assert.deepEqual(again[0].z, ["4 Eier", "125 g Mozzarella", "2 Tomaten"]);
    assert.equal(again[0].s.length, 2);
    assert.match(sent.messages[1].content, /Einkaufsliste: Tomaten; Mozzarella/);
    assert.equal(sent.temperature, 0.7);
  } finally {
    globalThis.fetch = orig;
  }
});
