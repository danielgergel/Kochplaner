import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { offerMatches, bestOffers, rankOffers } from "../js/offer-match.js";
import { canonicalStore, storeAllowed, compactOffer } from "../offers-worker/worker.js";
import { offerWhen, dedupeOffers, sortOffers } from "../offers-worker/shape.js";
import { itemOfferHtml, presentOffers } from "../js/offers.js";
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

test("echte Angebotsnamen: Füllwörter weg, Shakes und Beilagen bleiben draußen", () => {
  const yes = [
    ["Milch", "Bärenmarke Haltbare Milch 3,5/1,5% Fett. Je 1l"],
    ["Milch", "K-Classic H-Vollmilch 3,5 % Fett je 1-l-Packg. entspricht pro Packg. 0.79"],
    ["Milch", "Landliebe frische Weidemilch 3,8 % Fett, gekühlt je 1,5-l-Packg."],
    ["Milch", "Weihenstephan Haltbare Milch 1,5% oder 3,5% Fett, je 1l"],
    ["Milch", "Minus L Laktosefreie Haltbare Milch 1,5% Fett oder 3,5% Fett, 1 L"],
    ["Milch", "Milbona Haltbare Fettarme Milch 12x1 l"],
    ["Hackfleisch", "Mühlenhof Hackfleisch Gemischt, vom Schwein und Rind, je 800-g-Packung"],
    ["Hackfleisch", "Gut Ponholz Gemischt-Hackfleisch 500 g aus 50% Schwein und 50% Rind"],
    ["Hackfleisch", "Metzgerfrisch XXL Rinderhackfleisch Je 1 kg"],
    ["Hackfleisch", "BioBio Bio Rinder Hackfleisch zum Braten 400 g"],
    ["Hackfleisch", "Metzgerei Wilhelm Brandenburg Hackfleisch gemischt vom Rind und Schwein, je 250-g-Pckg."],
    ["Bananen", "Chiquita Bananen je kg"],
    ["Bananen", "Gut & Günstig Bananen aus Costa Rica oder Kolumbien, 1 kg"],
    ["Bananen", "thisisnobrand123 Bio Bananen Ecuador./kolumb. je kg"],
    ["Hähnchenbrust", "Metzgerfrisch Hähnchenbrustfilets HINWEIS: MIT LIDL PLUS APP Teilstücke. Je 1,5 kg"],
    ["Hähnchenbrust", "Gut & Günstig Hähnchenbrust-Innenfilets 400 g"],
    ["Hähnchenbrust", "MC Ennedy Hähnchenbrustfiletstücke Versch. Sorten. Gekühlt. Je 150 g"],
    ["Hähnchenbrust", "Meine Metzgerei Hähnchenbrustfilet XXL Teilstücke 1,5-kg-Packung"],
    ["Hähnchenbrust", "Hofmaier Hähnchenbrustfilet oder Putenbrustfilet versch. Sorten 100 g"],
    ["Reis", "Bon-Ri Basmati Reis 1-kg-Packung"],
    ["Reis", "Ben's Original Express Reis Versch. Sorten, je 220 g"],
  ];
  const no = [
    ["Milch", "Müller Müllermilch Shake Versch. Sorten; je 400-ml-Flasche; zzgl. Pfand 0.25"],
    ["Milch", "Müller Müllermilch versch. Sorten, 400 ml, zzgl. 0,25 Pfand"],
    ["Milch", "MC Ennedy Milchshake 230ml"],
    ["Milch", "Müller Müllermilch High Protein High Protein oder Matcha Milchmischgetränk, 1,5 % Fett im Milchanteil, versch. Sorten, gekühlt"],
    ["Milch", "Hafermilch"],
    ["Milch", "Buttermilch"],
    ["Hackfleisch", "Metzgerfrisch Schweine-Rinder-Cevapcici XXL gewürzt. je 800 g"],
    ["Hackfleisch", "BBQ Cevapcici Vom Rind; gewürzt; 400-g-Packung"],
    ["Hackfleisch", "ja! Hamburger Patties aus Rindfleisch, gewürzt, je 400-g-Pckg."],
    ["Hackfleisch", "Hacksteak"],
    ["Bananen", "Bruno Banani Man Duschgel je 250-ml-Fl."],
    ["Hähnchenbrust", "Minutenschnitzel"],
    ["Hähnchenbrust", "Hähnchen-Minutenschnitzel"],
    ["Reis", "Müller Milch Reis HINWEIS: MIT PENNY APP Versch. Sorten, je 200 g"],
    ["Reis", "Müller Milchreis XXL 250g"],
    ["Reis", "Dr. Oetker High Protein Milchreis HINWEIS: MIT LIDL PLUS APP oder Pudding Versch. Sorten. Gekühlt. Je 400 g"],
    ["Reis", "Bäckerkrönung Reis Waffeln Versch. Sorten, je 150 g"],
    ["Reis", "Frosta High Protein Hähnchen mit Reis & Brokkoli oder Asia Style mit Bandnudeln tiefgefroren, 500 g"],
    ["Reis", "Edeka Bio Bio Leinsamen geschrotet oder ganz naturbelassen, 500 g"],
    ["Reis", "Reiswaffeln"],
    ["Reis", "Milchreis"],
  ];
  for (const [item, name] of yes) assert.equal(offerMatches(item, name), true, name);
  for (const [item, name] of no) assert.equal(offerMatches(item, name), false, name);
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

test("Mehrfachpack, Packungspreis und Werbelink an echten Beispielen", () => {
  const milbona = compactOffer({
    price: 8.5, referencePrice: 0.71,
    description: "12x1 l",
    product: { name: "Haltbare Fettarme Milch" }, brand: { name: "Milbona" },
    unit: { shortName: "l" }, volume: 1, quantity: 12,
    validityDates: [{ from: "2026-10-25", to: "2026-10-31" }],
  }, "Milch", "Lidl", "76133");
  assert.equal(milbona.price, 8.5);
  assert.match(milbona.unit, /12×1 l/);
  assert.ok(Math.abs(milbona.unitPrice - 8.5 / 12) < 0.02);
  assert.equal(milbona.unitPriceUnit, "l");

  const classic = compactOffer({
    price: 8, referencePrice: 0.67,
    description: "3,5 % Fett 3,5 % Fett je 1-l-Packg. entspricht pro Packg. 0.79",
    product: { name: "H-Vollmilch" }, brand: { name: "K-Classic" },
    unit: { shortName: "l" }, volume: 1,
    validityDates: [{ from: "2026-10-22", to: "2026-10-24" }],
  }, "Milch", "Kaufland", "76133");
  assert.equal(classic.price, 0.79);
  assert.match(classic.unit, /1 l/);
  assert.equal(classic.unitPrice, 0.79);
  assert.doesNotMatch(classic.unit, /12/);

  const tracker = "https://ad.doubleclick.net/ddm/trackclk/N1343045.3361130SEVENONEMEDIA.DE/B34757911.436666463";
  const landliebe = compactOffer({
    price: 0.99, referencePrice: 0.99, description: "1-l-Packung",
    product: { name: "H-Milch" }, brand: { name: "Landliebe" },
    unit: { shortName: "l" }, volume: 1,
    externalUrl: tracker,
    validityDates: [{ from: "2026-10-29", to: "2026-10-31" }],
  }, "Milch", "Aldi", "76133");
  assert.doesNotMatch(landliebe.url, /doubleclick/);
  assert.match(landliebe.url, /^https:\/\/www\.marktguru\.de\/search\?/);
  assert.match(landliebe.url, /zipCode=76133/);

  const shop = compactOffer({
    price: 8, referencePrice: 0.67,
    description: "je 1-l-Packg. entspricht pro Packg. 0.79",
    product: { name: "H-Vollmilch" }, brand: { name: "K-Classic" },
    unit: { shortName: "l" }, volume: 1,
    externalUrl: "https://filiale.kaufland.de/angebote/uebersicht.html?kloffer-articleID=01065725",
  }, "Milch", "Kaufland", "76133");
  assert.match(shop.url, /kaufland\.de/);

  const hint = compactOffer({
    price: 0.99, referencePrice: 0.99,
    description: "HINWEIS: MIT EDEKA APP 0.88 € 1,5% oder 3,5% Fett, auch frische Milch 3,8% Fett, 1 L",
    product: { name: "Haltbare Milch" }, brand: { name: "Bärenmarke" },
    unit: { shortName: "l" }, volume: 1,
  }, "Milch", "Edeka", "76133");
  assert.doesNotMatch(hint.name, /HINWEIS/);
  assert.equal(hint.note, "Mit Edeka-App 0,88 €");
  assert.equal(hint.price, 0.99);
});

test("gleiche Angebote fallen zusammen, gültige stehen vor künftigen", () => {
  const a = compactOffer({
    price: 0.99, referencePrice: 0.99,
    description: "HINWEIS: MIT EDEKA APP 0.88 € 1,5% oder 3,5% Fett, auch frische Milch 3,8% Fett, 1 L",
    product: { name: "Haltbare Milch" }, brand: { name: "Bärenmarke" },
    unit: { shortName: "l" }, volume: 1,
    validityDates: [{ from: "2026-10-18", to: "2026-10-24" }],
  }, "Milch", "Edeka", "76133");
  const b = compactOffer({
    price: 0.99, referencePrice: 0.99,
    description: "HINWEIS: MIT EDEKA APP 0.88 € 1,5%, 3,5% oder Frische Milch 3,8% Fett, 1 L",
    product: { name: "Haltbare Milch" }, brand: { name: "Bärenmarke" },
    unit: { shortName: "l" }, volume: 1,
    validityDates: [{ from: "2026-10-18", to: "2026-10-24" }],
  }, "Milch", "Edeka", "76133");
  assert.equal(dedupeOffers([a, b]).length, 1);
  assert.equal(offerWhen("2026-10-26", "2026-10-23"), "ab Mo.");
  const later = { ...a, from: "2026-10-26", until: "2026-10-31", unitPrice: 0.5, price: 0.5 };
  const now = { ...a, from: "2026-10-18", until: "2026-10-24", unitPrice: 1.2, price: 1.2 };
  const sorted = sortOffers([later, now], "2026-10-23");
  assert.equal(sorted[0].from, "2026-10-18");
  assert.equal(sorted[1].from, "2026-10-26");
  const shown = presentOffers("Milch", [
    { s: "Lidl", n: "Milbona Haltbare Fettarme Milch 12x1 l", pr: "8.5", unit: "1 l", up: "0.71", upu: "l", from: "2026-10-26", u: "2026-10-31", url: "https://ad.doubleclick.net/ddm/trackclk/x" },
  ], "2026-10-23", "76133");
  assert.equal(shown.length, 1);
  assert.match(shown[0].unit, /12×1 l/);
  assert.equal(shown[0].pr, "8.5");
  assert.doesNotMatch(shown[0].url, /doubleclick/);
  const html = itemOfferHtml("Milch", shown, { today: "2026-10-23" });
  assert.match(html, /ab Mo\./);
  assert.match(html, /12×1 l/);
});

test("die App enthält keinen marktguru-Schlüssel und keine Wochen-Aufgabe", () => {
  const app = ["js/offers.js", "js/shopping.js", "js/settings.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  assert.doesNotMatch(app, /Wochen-Aufgabe/);
  assert.doesNotMatch(app, /x-apikey|MARKTGURU_API_KEY/);
  assert.match(app, /Angebote aktualisieren/);
  assert.match(fs.readFileSync(path.join(root, "sw.js"), "utf8"), /js\/offers\.js/);
});
