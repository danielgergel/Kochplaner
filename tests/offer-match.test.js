import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { offerMatches, bestOffers, rankOffers } from "../js/offer-match.js";
import { canonicalStore, storeAllowed, compactOffer } from "../offers-worker/worker.js";
import { itemOfferHtml } from "../js/offers.js";
import { sanitizeAoffers, sanitizeOfferUrl } from "../js/validate.js";

const root = path.resolve(import.meta.dirname, "..");

test("Kopfwort muss passen, Synonyme gelten, falsche Treffer fallen weg", () => {
  assert.equal(offerMatches("Hackfleisch", "Rinderhack 500 g"), true);
  assert.equal(offerMatches("Hackfleisch", "Gemischtes Hack"), true);
  assert.equal(offerMatches("Hackfleisch", "Hacksteak"), false);
  assert.equal(offerMatches("Milch", "Frische Vollmilch 3,5 %"), true);
  assert.equal(offerMatches("Milch", "Frische Milch 1 l"), true);
  assert.equal(offerMatches("Milch", "Hafermilch"), false);
  assert.equal(offerMatches("Milch", "Buttermilch"), false);
  assert.equal(offerMatches("Erdnussmus", "Erdnussbutter"), true);
  assert.equal(offerMatches("Erdnussmus", "Erdnusscreme"), true);
  assert.equal(offerMatches("Hähnchenbrust", "Minutenschnitzel"), false);
  assert.equal(offerMatches("Hähnchenbrust", "Hähnchen-Minutenschnitzel"), false);
  assert.equal(offerMatches("Hähnchenbrust", "Hähnchenbrustfilet 400 g"), true);
  assert.equal(offerMatches("Reis", "Reiswaffeln"), false);
  assert.equal(offerMatches("Reis", "Milchreis"), false);
  assert.equal(offerMatches("Reis", "Basmati Reis 1 kg"), true);
});

test("Grundpreis entscheidet, nicht der Packungspreis", () => {
  const ranked = rankOffers([
    { n: "A", pr: "2.00", up: "8" },
    { n: "B", pr: "5.00", up: "3.5" },
    { n: "C", pr: "1.00", up: "" },
  ]);
  assert.deepEqual(ranked.map(x => x.n), ["B", "A", "C"]);
  const best = bestOffers("Milch", [
    { n: "Hafermilch", pr: "0.80", up: "0.80", s: "Lidl" },
    { n: "Vollmilch", pr: "1.19", up: "1.19", s: "REWE" },
    { n: "Frische Milch", pr: "0.95", up: "0.95", s: "Aldi" },
  ]);
  assert.deepEqual(best.map(x => x.s), ["Aldi", "REWE"]);
});

test("Anzeige: Treffer, leerer Satz, Prospekt-Links", () => {
  const empty = itemOfferHtml("Reis", [], {});
  assert.match(empty, /Kein passendes Angebot/);
  const hit = itemOfferHtml("Milch", [{
    s: "REWE", n: "Vollmilch", pr: "0.99", unit: "1 l", up: "0.99", upu: "l", u: "2026-10-25",
    url: "https://www.marktguru.de/search?q=milch",
  }], {});
  assert.match(hit, /REWE/);
  assert.match(hit, /Grundpreis 0,99 €\/l/);
  assert.match(hit, /gültig bis 25\.10\.2026/);
  const fb = itemOfferHtml("Reis", [], { fallback: true, zip: "76133" });
  assert.match(fb, /marktguru\.de/);
  assert.match(fb, /kaufda\.de/);
  assert.match(fb, /76133/);
});

test("gespeicherte Angebotstreffer behalten Grundpreis und Link", () => {
  const clean = sanitizeAoffers({
    at: "2026-10-23", ts: 1761200000000,
    byItem: { Milch: [{ s: "REWE", n: "Vollmilch", pr: "0.99", up: "0.99", upu: "l", u: "2026-10-25", url: "https://www.marktguru.de/search?q=milch" }] },
    failed: ["Reis"],
  });
  assert.equal(clean.byItem.Milch[0].up, "0.99");
  assert.equal(clean.byItem.Milch[0].url.startsWith("https://"), true);
  assert.deepEqual(clean.failed, ["Reis"]);
  assert.equal(sanitizeOfferUrl("https://kochplaner-angebote.danielgergel.workers.dev/"), "https://kochplaner-angebote.danielgergel.workers.dev");
  assert.equal(sanitizeOfferUrl("http://example.com"), "");
});

test("Worker filtert Läden und rechnet den Grundpreis", () => {
  assert.equal(canonicalStore("ALDI SÜD"), "Aldi");
  assert.equal(canonicalStore("Netto Marken-Discount"), "Netto");
  assert.equal(canonicalStore("E center"), "Edeka");
  assert.equal(storeAllowed("dm", ["REWE", "Lidl"]), "");
  assert.equal(storeAllowed("REWE", ["Lidl", "REWE"]), "REWE");
  const row = compactOffer({
    price: 1.19, referencePrice: 1.19, description: "1 l",
    product: { name: "Vollmilch" }, brand: { name: "Ja!" },
    unit: { shortName: "l" }, volume: 1,
    validityDates: [{ from: "2026-10-20T00:00:00Z", to: "2026-10-25T00:00:00Z" }],
  }, "Milch", "REWE", "76133");
  assert.equal(row.store, "REWE");
  assert.equal(row.item, "Milch");
  assert.equal(row.unitPrice, 1.19);
  assert.equal(row.until, "2026-10-25");
  assert.match(row.url, /^https:\/\//);
  assert.match(row.name, /Vollmilch/);
});

test("die App enthält keinen marktguru-Schlüssel und keine Wochen-Aufgabe", () => {
  const app = ["js/offers.js", "js/shopping.js", "js/settings.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  assert.doesNotMatch(app, /Wochen-Aufgabe/);
  assert.doesNotMatch(app, /x-apikey|MARKTGURU_API_KEY/);
  assert.match(app, /Angebote aktualisieren/);
  assert.match(fs.readFileSync(path.join(root, "sw.js"), "utf8"), /js\/offers\.js/);
});
