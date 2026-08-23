const CACHE="mathbuddy-v22";const ASSETS=["/","/index.html","/manifest.webmanifest","/mathbuddy-mascot.png","/certificate-bg.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;
 const url=new URL(e.request.url);
 if(url.pathname.startsWith("/api/")){e.respondWith(fetch(e.request));return}
 const isPage=e.request.mode==="navigate"||e.request.destination==="document"||e.request.headers.get("accept")?.includes("text/html");
 if(isPage){e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(c=>c||caches.match("/index.html"))))}
 else{e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy));return r}).catch(()=>caches.match("/index.html"))))}
});
