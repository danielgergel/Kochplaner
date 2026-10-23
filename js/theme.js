/* Darstellung: auto folgt dem Handy, light und dark setzen data-theme an <html>. */
export const THEME_KEY = "kochplaner.theme";
const LIGHT = "#0f766e";
const DARK = "#0e1716";

export function normalizeTheme(v){
  return v === "light" || v === "dark" || v === "auto" ? v : "auto";
}

export function readTheme(){
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)); } catch (e) { return "auto"; }
}

export function systemDark(){
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(mode){
  const theme = normalizeTheme(mode);
  const html = document.documentElement;
  if (theme === "light" || theme === "dark") html.setAttribute("data-theme", theme);
  else html.removeAttribute("data-theme");
  const dark = theme === "dark" || (theme !== "light" && systemDark());
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? DARK : LIGHT);
  return theme;
}

export function saveTheme(mode){
  const theme = normalizeTheme(mode);
  try {
    if (theme === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch (e) {}
  return applyTheme(theme);
}

if (typeof document !== "undefined") {
  applyTheme(readTheme());
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (readTheme() === "auto") applyTheme("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (e) {}
}
