/* Service Worker für den Kochplaner: App, Schriften und Bibliotheken liegen im Zwischenspeicher, damit sie ohne Internet starten. */
const V = "kochplaner-v10";
const CORE = [
  "./",
  "index.html",
  "apple-touch-icon.png",
  "css/app.css",
  "js/app.js",
  "js/theme-boot.js",
  "js/theme.js",
  "js/state.js",
  "js/util.js",
  "js/validate.js",
  "js/shopcalc.js",
  "js/nutrition.js",
  "js/ocr-text.js",
  "js/ocr.js",
  "js/recipes.js",
  "js/plan.js",
  "js/shopping.js",
  "js/diary.js",
  "js/scanner.js",
  "js/sync.js",
  "js/backup.js",
  "js/settings.js",
  "js/panels.js",
  "js/data/recipes.js",
  "js/data/foods.js",
  "js/data/wake.js",
  "js/data/shop-rules.js",
  "vendor/fonts/barlow-400.woff2",
  "vendor/fonts/barlow-500.woff2",
  "vendor/fonts/barlow-600.woff2",
  "vendor/fonts/barlow-condensed-600.woff2",
  "vendor/fonts/barlow-condensed-700.woff2",
  "vendor/tesseract/tesseract.min.js",
  "vendor/tesseract/worker.min.js",
  "vendor/tesseract/tesseract-core-lstm.wasm.js",
  "vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
  "vendor/tesseract/deu.traineddata.gz",
  "vendor/barcode/ponyfill.min.js",
  "vendor/firebase/firebase-app.js",
  "vendor/firebase/firebase-firestore.js",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (r, res) => { try { if (res && (res.status === 200 || res.type === "opaque")) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)).catch(() => {}); } } catch (e) {} return res; };
const cached = r => caches.match(r).then(m => m || null);
const shell = () => caches.match("index.html");
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  const nav = r.mode === "navigate" || (r.headers.get("accept") || "").includes("text/html");
  if (u.origin === location.origin) {
    e.respondWith((async () => {
      if (!navigator.onLine) {
        const hit = await cached(r);
        if (hit) return hit;
        if (nav) { const page = await shell(); if (page) return page; }
        return Response.error();
      }
      try {
        const res = await Promise.race([
          fetch(r).then(x => { if (x.ok) return put(r, x); throw new Error("bad"); }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
        ]);
        return res;
      } catch (err) {
        const hit = await cached(r);
        if (hit) return hit;
        if (nav) { const page = await shell(); if (page) return page; }
        return Response.error();
      }
    })());
  } else if (/(^|\.)jsdelivr\.net$|(^|\.)gstatic\.com$|^fonts\.googleapis\.com$/.test(u.hostname)) {
    e.respondWith(cached(r).then(m => m || fetch(r).then(res => put(r, res))));
  }
});
