import test from "node:test";
import assert from "node:assert/strict";
import { detectDiet, dietOf, dietPasses, dietMark } from "../js/diet.js";
import { SUBS, substituteFor } from "../js/data/subs.js";
import { partitionOffers, noOfferLabel, chainOf, chainLabel, groupOffersByChain } from "../js/offers.js";
import { expireChecked, CHECK_MS, planStamp, reconcileHidden, dropHidden } from "../js/shopping.js";
import { mergeRecipe } from "../js/recipes.js";
import { ST } from "../js/state.js";
import { sanitizeState } from "../js/validate.js";
import { offerMatches } from "../js/offer-match.js";
import { shapeOffer } from "../offers-worker/shape.js";
import worker, { jsonResponse } from "../offers-worker/worker.js";
import { loadBuiltinRecipes } from "../js/data/recipes.js";

test("Ernährung folgt den Zutaten, die manuelle Wahl gewinnt", () => {
  assert.equal(detectDiet(["150 g Hähnchenbrust", "100 g Reis"]), "fleisch");
  assert.equal(detectDiet(["300 ml Milch", "1 TL Honig"]), "vegetarisch");
  assert.equal(detectDiet(["2 Eier", "Salz"]), "vegetarisch");
  assert.equal(detectDiet(["300 ml Hafermilch", "1 Banane", "30 g Haferflocken"]), "vegetarisch");
  assert.equal(detectDiet(["200 g Reis", "200 g Brokkoli", "1 TL Öl"]), "vegetarisch");
  assert.equal(detectDiet(["80 g Halloumi", "40 g Hummus"]), "vegetarisch");
  assert.equal(detectDiet(["150 g Hähnchenbrust", "100 g Reis"]), "fleisch");
  assert.equal(dietOf({ id:"M1", z:["150 g Hähnchenbrust"] }, { M1:"vegan" }), "vegetarisch");
  assert.equal(dietOf({ id:"F1", z:["200 g Reis"] }, {}), "vegetarisch");
  assert.equal(dietPasses("vegan", "Vegetarisch"), true);
  assert.equal(dietPasses("vegetarisch", "Vegetarisch"), true);
  assert.equal(dietPasses("fleisch", "Vegetarisch"), false);
  assert.equal(dietPasses("fleisch", "Alle"), true);
  const mark = dietMark("vegetarisch");
  assert.match(mark, />v</);
  assert.doesNotMatch(mark, /<svg/);
  assert.equal(dietMark("vegan").includes(">v<"), true);
  assert.equal(dietMark("fleisch"), "");
  assert.equal(detectDiet(["½ Beutel Curry (ohne Hähnchen)", "100 ml Kokosmilch"]), "vegetarisch");
  assert.equal(detectDiet(["1 EL Currypaste (ohne Garnelen)"]), "vegetarisch");
  assert.equal(detectDiet(["150 g Hähnchenbrust"]), "fleisch");
  assert.equal(detectDiet(loadBuiltinRecipes().E11.z), "vegetarisch");
});

test("Ersatzliste kennt Kreuzkümmel und bleibt bei Pflanzenmilch", () => {
  assert.ok(SUBS.length >= 80);
  const cumin = substituteFor("1 TL Kreuzkümmel");
  assert.ok(cumin);
  assert.match(cumin.alts.join(" "), /Koriander/);
  assert.match(cumin.alts.join(" "), /Paprika/);
  assert.equal(substituteFor("300 ml Hafermilch").id, "hafermilch");
  assert.equal(substituteFor("Salz und Pfeffer"), null);
  assert.equal(substituteFor("1 Paprika").id, "paprikaschote");
  assert.equal(substituteFor("1 TL Paprikapulver").id, "paprikapulver");
});

test("Angebote ohne Treffer rutschen in eine Zeile", () => {
  const items = ["Milch", "Reis", "Bananen"];
  const parts = partitionOffers(items, item => item === "Milch" ? 2 : 0, () => false);
  assert.deepEqual(parts.shown, ["Milch"]);
  assert.deepEqual(parts.rest, ["Reis", "Bananen"]);
  const skipped = partitionOffers(items, () => 0, (item, i) => i === 2);
  assert.deepEqual(skipped.shown, []);
  assert.equal(skipped.rest.length, 3);
  assert.equal(noOfferLabel(1), "1 Artikel ohne Angebot");
  assert.equal(noOfferLabel(14), "14 Artikel ohne Angebot");
});

test("abgehakte Artikel verschwinden nach 30 Minuten, alte Haken ohne Zeit bleiben", () => {
  assert.equal(CHECK_MS, 30 * 60 * 1000);
  const now = 1_760_000_000_000;
  const fresh = expireChecked(
    { a: now - 1000, b: 1, c: now - CHECK_MS - 1 },
    [{ t:"Salz", d:true, at: now - CHECK_MS - 5 }, { t:"Pfeffer", d:true, at: now - 1000 }, { t:"Öl", d:false }],
    {},
    now,
    CHECK_MS,
  );
  assert.equal(fresh.sc.a, now - 1000);
  assert.equal(fresh.sc.b, 1);
  assert.equal(fresh.sc.c, undefined);
  assert.equal(fresh.sx.c, 1);
  assert.deepEqual(fresh.extra.map(x => x.t), ["Pfeffer", "Öl"]);
  assert.equal(fresh.changed, true);
});

test("Angebote stehen je Ladenkette zusammen, Filialen zählen als eine Kette", () => {
  assert.equal(chainOf("Lidl"), "Lidl");
  assert.equal(chainOf("ALDI SÜD"), "Aldi");
  assert.equal(chainOf("Aldi Nord"), "Aldi");
  assert.equal(chainOf("E center"), "Edeka");
  assert.equal(chainOf("Netto Marken-Discount"), "Netto");
  const items = ["Milch", "Reis", "Bananen", "Öl"];
  const hits = {
    Milch: [{ s:"Lidl", n:"Haltbare Milch", pr:"0.99" }, { s:"Aldi Süd", n:"H-Milch", pr:"0.95" }, { s:"Aldi Nord", n:"Milch", pr:"1.05" }],
    Reis: [{ s:"Lidl Filiale", n:"Basmati Reis", pr:"1.49" }, { s:"REWE", n:"Reis", pr:"1.79" }],
    Bananen: [{ s:"Lidl", n:"Bananen", pr:"1.11" }],
    Öl: [],
  };
  const g = groupOffersByChain(items, item => hits[item]);
  assert.deepEqual(g.stores.map(s => s.chain), ["Lidl", "Aldi", "REWE"]);
  assert.deepEqual(g.stores.map(s => s.count), [3, 1, 1]);
  assert.equal(g.stores[1].rows[0].hits.length, 2);
  assert.deepEqual(g.rest, ["Öl"]);
  assert.equal(chainLabel("Lidl", 3, 4), "Lidl (3 von 4)");
  assert.equal(g.total, 4);
});

test("ausgeblendete Artikel gelten nur für den aktuellen Plan", () => {
  const key = "Fleisch & Wurst|Hähnchenbrust|g";
  ST.sel = { M1: 1 };
  ST.sx = { [key]: 1 };
  ST.sxPlan = "";
  reconcileHidden();
  assert.deepEqual(ST.sx, {});
  assert.equal(ST.sxPlan, "");

  ST.sx = { [key]: 1 };
  ST.sxPlan = planStamp(ST.sel);
  reconcileHidden();
  assert.equal(ST.sx[key], 1);

  ST.sel = { F1: 1 };
  reconcileHidden();
  assert.equal(ST.sx[key], undefined);

  ST.sel = { M1: 1 };
  ST.sx = { [key]: 1 };
  ST.sxPlan = planStamp(ST.sel);
  dropHidden();
  assert.deepEqual(ST.sx, {});
  ST.sel = {};
  ST.sxPlan = "";

  const old = sanitizeState({
    sel: { M1: 1 },
    sx: { [key]: 1 },
  });
  assert.deepEqual(old.sx, {});
  assert.equal(old.sxPlan, "");
  const kept = sanitizeState({
    sel: { M1: 1 },
    sx: { [key]: 1 },
    sxPlan: "M1:1",
  });
  assert.equal(kept.sx[key], 1);
  assert.equal(kept.sxPlan, "M1:1");
});

test("OPTIONS ist 204 ohne Body, POST bleibt erreichbar", async () => {
  const opt = jsonResponse(null, 204, "https://danielgergel.github.io");
  assert.equal(opt.status, 204);
  assert.equal(await opt.text(), "");
  assert.equal(opt.headers.get("access-control-allow-origin"), "https://danielgergel.github.io");
  assert.match(opt.headers.get("access-control-allow-methods"), /POST/);
  assert.match(opt.headers.get("access-control-allow-methods"), /OPTIONS/);
  const live = await worker.fetch(new Request("https://kochplaner-angebote.example/offers", {
    method: "OPTIONS",
    headers: { Origin: "http://127.0.0.1:8765" },
  }));
  assert.equal(live.status, 204);
  assert.equal(live.headers.get("access-control-allow-origin"), "http://127.0.0.1:8765");
  const post = await worker.fetch(new Request("https://kochplaner-angebote.example/offers", {
    method: "POST",
    headers: { Origin: "http://localhost:8080", "content-type": "application/json" },
    body: "{",
  }));
  assert.equal(post.status, 400);
  const data = await post.json();
  assert.equal(data.ok, false);
  assert.equal(post.headers.get("access-control-allow-origin"), "http://localhost:8080");
});

test("Platzhaltermarke und eindeutig falsche Treffer fallen weg", () => {
  const row = shapeOffer({
    price: 1.11,
    product: { name: "Bananen 1 kg" },
    brand: { name: "thisisnobrand123" },
    description: "Costa Rica",
  }, "Bananen", "Lidl", "76133");
  assert.doesNotMatch(row.name, /thisisnobrand123/i);
  assert.match(row.name, /Bananen/);
  assert.equal(offerMatches("Bananen", "Bananen Duschgel"), false);
  assert.equal(offerMatches("Bananen", "Chiquita Bananen 1 kg"), true);
  assert.equal(offerMatches("Spülmittel", "Spülmittel 1 l"), true);
});

test("eine geänderte Fassung behält die Rezeptnummer", () => {
  const base = { id:"M1", n:"Pfanne", k:10, p:2, z:["Reis"], s:["Kochen"], ns:false, w:0.5 };
  const merged = mergeRecipe(base, { id:"M1", n:"Meine Pfanne", cust:1, z:["Reis","Salat"] });
  assert.equal(merged.id, "M1");
  assert.equal(merged.n, "Meine Pfanne");
  assert.equal(merged.cust, undefined);
  assert.equal(merged.over, 1);
  assert.equal(merged.w, 0.5);
  assert.equal(base.n, "Pfanne");
});
