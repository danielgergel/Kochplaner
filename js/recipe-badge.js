/* Anzeigename für Rezeptnummern. Die gespeicherte id bleibt unverändert. */

export function idNumber(id){
  const n = parseInt(String(id || "").slice(1), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Kurzes Schild: eingebaute Rezepte behalten F1, M2, … Eigene werden X1, X2 nach Erstellzeit. */
export function badgeOf(id, cust){
  if (typeof id !== "string" || !id) return "";
  if (id[0] !== "X") return id;
  const seen = new Set();
  const ids = [];
  for (const r of (Array.isArray(cust) ? cust : [])) {
    const x = r && r.id;
    if (typeof x !== "string" || x[0] !== "X" || seen.has(x)) continue;
    seen.add(x);
    ids.push(x);
  }
  ids.sort((a, b) => idNumber(a) - idNumber(b) || (a < b ? -1 : a > b ? 1 : 0));
  const i = ids.indexOf(id);
  return i >= 0 ? "X" + (i + 1) : "Eigen";
}

/** Suchtext: Name, gespeicherte id und das sichtbare Schild. */
export function haystack(r, cust){
  const n = r && r.n ? r.n : "";
  const id = r && r.id ? r.id : "";
  return (n + " " + id + " " + badgeOf(id, cust)).toLowerCase();
}
