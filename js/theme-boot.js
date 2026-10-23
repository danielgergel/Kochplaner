/* Läuft vor dem Stylesheet, damit Hell oder Dunkel nicht kurz falsch aufblitzt. Kein Modul, damit es sofort gilt. */
(function () {
  try {
    var t = localStorage.getItem("kochplaner.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    var dark = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0e1716" : "#0f766e");
  } catch (e) {}
})();
