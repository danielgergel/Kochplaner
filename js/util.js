export const $ = s => document.querySelector(s);
export const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export function toast(m){
  const t = $("#toast");
  if (!t) return;
  t.textContent = m;
  t.classList.add("on");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("on"), 1800);
}

export const dkey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const f1 = n => String(Math.round(Number(n) * 10) / 10).replace(".", ",");

export function dlabel(k){
  const t = dkey(new Date());
  if (k === t) return "Heute";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (k === dkey(y)) return "Gestern";
  const [a, b, c] = String(k).split("-");
  return (c || "") + "." + (b || "") + "." + (a || "");
}

export const nm = s => String(s).replace(/½/g, " 0.5 ").toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z0-9%. ]/g, " ").replace(/\.(?!\d)/g, " ").replace(/(^|\D)\./g, "$1 ").replace(/\s+/g, " ").trim();
export const stripPl = w => String(w).replace(/(en|n|e|s)$/, "");

export const ck = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

export function copyTxt(s){
  try {
    navigator.clipboard.writeText(s).then(() => toast("Kopiert"), () => toast("Bitte lange auf den Code tippen und kopieren"));
  } catch (e) {
    toast("Bitte lange auf den Code tippen und kopieren");
  }
}

export const WD = [["Mo","Montag"],["Di","Dienstag"],["Mi","Mittwoch"],["Do","Donnerstag"],["Fr","Freitag"],["Sa","Samstag"],["So","Sonntag"]];
export const WDSHORT = ["So","Mo","Di","Mi","Do","Fr","Sa"];
