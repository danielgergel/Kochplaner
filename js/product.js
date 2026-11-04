/* Barcode-Produkte: Antwort von Open Food Facts prüfen und bereinigen, Mengen rechnen, als eigenes Lebensmittel speichern.
   Reine Logik ohne Oberfläche (testbar mit node). Es geht nur die Barcode-Nummer ins Netz, nie ein Foto. */

export const cleanText = (v, max) => (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/* Zahl aus Zahl oder Text („12,5“), nur im erlaubten Bereich, sonst null. */
export function numIn(v, min, max){
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? parseFloat(v.replace(/\s/g, "").replace(",", ".")) : NaN);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/* Nur Ziffern, 8 bis 14 Stellen (EAN-8, UPC, EAN-13, GTIN-14). Sonst leer. */
export function validEan(s){
  const d = String(s == null ? "" : s).replace(/\D/g, "");
  return d.length >= 8 && d.length <= 14 ? d : "";
}

/* Antwort von Open Food Facts (/api/v2/product/<ean>.json) -> Produkt oder null (nicht gefunden). */
export function shapeProduct(j){
  const pr = j && typeof j === "object" ? j.product : null;
  if (!pr || typeof pr !== "object") return null;
  const nu = pr.nutriments && typeof pr.nutriments === "object" ? pr.nutriments : {};
  let k = numIn(nu["energy-kcal_100g"], 0, 900);
  if (k == null) { const kj = numIn(nu["energy_100g"], 0, 3800); if (kj != null) k = kj / 4.184; }
  const pp = numIn(nu["proteins_100g"], 0, 100);
  const brand = cleanText(String(pr.brands || "").split(",")[0], 40);
  const name = cleanText(pr.product_name, 80) || "Unbekanntes Produkt";
  return {
    v: 2,
    n: (brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? brand + " " : "") + name,
    k: k == null ? null : Math.round(k),
    p: pp == null ? null : Math.round(pp * 10) / 10,
    s: numIn(pr.serving_quantity, 1, 5000) || null,
    ss: cleanText(pr.serving_size, 40),
    q: numIn(pr.product_quantity, 1, 10000) || null,
    qs: cleanText(pr.quantity, 40),
  };
}

/* kcal und Eiweiß für eine Menge in Gramm. k100 und p100 sind Werte pro 100 g. */
export function amountCalc(k100, p100, grams){
  const g = Number(grams);
  if (!(g > 0) || !Number.isFinite(g)) return { k: 0, p: 0 };
  return { k: (Number(k100) || 0) * g / 100, p: (Number(p100) || 0) * g / 100 };
}

/* Standardmenge: Portionsgröße, sonst 100 g. */
export const defaultAmount = p => (p && p.s > 0 ? p.s : 100);

/* Eintrag für „Meine Lebensmittel“ (wie bisher n, k, p für eine Portion; dazu b = Barcode, k1/p1 = pro 100 g, g = Portionsgröße). */
export function foodFromProduct(p, ean, k100, p100){
  const g = defaultAmount(p);
  const a = amountCalc(k100, p100, g);
  const out = { n: cleanText(p.n, 120) || "Produkt", k: Math.round(a.k), p: Math.round(a.p * 10) / 10, k1: Math.round(k100 * 10) / 10, p1: Math.round(p100 * 10) / 10, g };
  const b = validEan(ean);
  if (b) out.b = b;
  if (p.q > 0) out.q = p.q;
  return out;
}

/* Gemerktes Lebensmittel -> Produkt für den Scan (nur mit Werten pro 100 g). */
export function productFromFood(f){
  if (!f || !(f.k1 >= 0) || f.k1 == null) return null;
  return { v: 2, n: f.n, k: f.k1, p: f.p1 == null ? null : f.p1, s: f.g || null, ss: "", q: f.q || null, qs: "", local: 1 };
}

/* Zutat für „Mahlzeit kombinieren“: Werte pro 100 g, Menge in Gramm. */
export function mealItemFromProduct(p, k100, p100, grams){
  const name = cleanText(p.n, 60) || "Produkt";
  return { n: name, k: Number(k100) || 0, p: Number(p100) || 0, c: Math.round(grams * 10) / 10, ul: "g", ug: 1, nu: p.s ? "Portion" : null, nug: p.s || 0, lb: name, gr: 0 };
}
