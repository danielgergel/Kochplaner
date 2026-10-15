/* Service Worker für den Kochplaner: App und Bibliotheken werden zwischengespeichert, damit sie auch ohne Internet starten. */
const V="kochplaner-v7";
const CORE=["./","index.html","apple-touch-icon.png"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
const put=(r,res)=>{try{if(res&&(res.status===200||res.type==="opaque")){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp)).catch(()=>{});}}catch(e){}return res;};
self.addEventListener("fetch",e=>{
  const r=e.request; if(r.method!=="GET") return;
  const u=new URL(r.url);
  if(u.origin===location.origin){
    /* Eigene Dateien: erst das Netz (maximal 3 Sekunden), sonst der Zwischenspeicher */
    e.respondWith(
      Promise.race([fetch(r).then(res=>{if(res.ok) return put(r,res); throw new Error("bad");}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),3000))])
        .catch(()=>caches.match(r).then(m=>m||caches.match("index.html")))
    );
  }else if(/(^|\.)jsdelivr\.net$|(^|\.)gstatic\.com$|^fonts\.googleapis\.com$/.test(u.hostname)){
    /* Bibliotheken und Schriften: einmal laden, dann aus dem Zwischenspeicher */
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>put(r,res))));
  }
});
